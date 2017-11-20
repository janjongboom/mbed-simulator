/*
 * Copyright (c) 2015 ARM Limited. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 * Licensed under the Apache License, Version 2.0 (the License); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an AS IS BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
#include "mbed-client-classic/m2mconnectionhandlerpimpl.h"
#include "mbed-client/m2mconnectionobserver.h"
#include "mbed-client/m2mconstants.h"
#include "mbed-client/m2msecurity.h"
#include "mbed-client/m2mconnectionhandler.h"

#include "pal.h"
#include "pal_rtos.h"
#include "pal_errors.h"
#include "pal_macros.h"
#include "pal_network.h"

#include "eventOS_scheduler.h"
#include "eventOS_event.h"

#include "mbed-trace/mbed_trace.h"

#include <stdlib.h> // free() and malloc()

#define TRACE_GROUP "mClt"

int8_t M2MConnectionHandlerPimpl::_tasklet_id = -1;

static M2MConnectionHandlerPimpl *connection_handler = NULL;

extern "C" void connection_event_handler(arm_event_s *event)
{
    if(!connection_handler){
        return;
    }

    switch(event->event_type){
        case M2MConnectionHandlerPimpl::ESocketReadytoRead:
            connection_handler->receive_handler();
            break;

        case M2MConnectionHandlerPimpl::ESocketSend:
            connection_handler->send_socket_data((uint8_t*)event->data_ptr, event->event_data);
            free(event->data_ptr);
            break;

        case M2MConnectionHandlerPimpl::ESocketDnsHandler:
            connection_handler->dns_handler();
            break;

        default:
            tr_info("connection_event_handler: default type: %d", (int)event->event_type);
            break;
    }
}

// This callback is received from "some" socket event and we need to
// act according to the socket state.
void M2MConnectionHandlerPimpl::send_receive_event(void)
{
    arm_event_s event;
    event.receiver = M2MConnectionHandlerPimpl::_tasklet_id;
    event.sender = 0;
    event.data_ptr = NULL;
    event.priority = ARM_LIB_HIGH_PRIORITY_EVENT;

    // The dns_handler() is used for the socket connection phase and
    // after socket is connected, all the callbacks are assumed to come
    // from async socket data send/receival.
    if (_socket_state == ESocketStateConnected) {
        event.event_type = ESocketReadytoRead;
    } else if (_socket_state == ESocketStateConnectBeingCalled) {
        // The pal_connect() may issue callback even during it is called, which we ignore completely.
        tr_debug("send_receive_event : _socket_state: ESocketStateConnectBeingCalled, ignoring event");
        return;
    } else if (_socket_state == ESocketStateCloseBeingCalled) {
        // The pal_close() may issue callback even during it is called, which we ignore completely.
        tr_debug("send_receive_event : _socket_state: ESocketStateCloseBeingCalled, ignoring event");
        return;
    } else {
        event.event_type = ESocketDnsHandler;
    }

    eventOS_event_send(&event);
}

extern "C" void socket_event_handler(void)
{
    if(!connection_handler) {
        return;
    }
    connection_handler->send_receive_event();
}

M2MConnectionHandlerPimpl::M2MConnectionHandlerPimpl(M2MConnectionHandler* base, M2MConnectionObserver &observer,
                                                     M2MConnectionSecurity* sec,
                                                     M2MInterface::BindingMode mode,
                                                     M2MInterface::NetworkStack stack)
:_base(base),
 _observer(observer),
 _security_impl(sec),
 _security(NULL),
 _use_secure_connection(false),
 _binding_mode(mode),
 _network_stack(stack),
 _socket(0),
 _is_handshaking(false),
 _listening(true),
 _server_type(M2MConnectionObserver::LWM2MServer),
 _server_port(0),
 _listen_port(0),
 _running(false),
 _net_iface(0),
_socket_state(ESocketStateDisconnected)
{
#ifndef PAL_NET_TCP_AND_TLS_SUPPORT
    if (is_tcp_connection()) {
        tr_error("ConnectionHandler: TCP support not available.");
        return;
    }
#endif

    if(PAL_SUCCESS != pal_init()){
        tr_error("PAL init failed.");
    }

    memset(&_address, 0, sizeof _address);
    memset(&_socket_address, 0, sizeof _socket_address);
    memset(&_ipV4Addr, 0, sizeof(palIpV4Addr_t));
    memset(&_ipV6Addr, 0, sizeof(palIpV6Addr_t));
    memset(&_recv_buffer, 0, BUFFER_LENGTH);

    connection_handler = this;
    eventOS_scheduler_mutex_wait();
    if (M2MConnectionHandlerPimpl::_tasklet_id == -1) {
        M2MConnectionHandlerPimpl::_tasklet_id = eventOS_event_handler_create(&connection_event_handler, ESocketIdle);
    }
    eventOS_scheduler_mutex_release();
}

M2MConnectionHandlerPimpl::~M2MConnectionHandlerPimpl()
{
    tr_debug("~M2MConnectionHandlerPimpl()");
    stop_listening();

    close_socket();

    delete _security_impl;
    tr_debug("~M2MConnectionHandlerPimpl() - OUT");
}

bool M2MConnectionHandlerPimpl::bind_connection(const uint16_t listen_port)
{
    _listen_port = listen_port;
    return true;
}

bool M2MConnectionHandlerPimpl::resolve_server_address(const String& server_address,
                                                       const uint16_t server_port,
                                                       M2MConnectionObserver::ServerType server_type,
                                                       const M2MSecurity* security)
{
    tr_debug("resolve_server_address()");

    // restart the connection state machine
    _socket_state = ESocketStateDisconnected;

    _security = security;
    _server_port = server_port;
    _server_type = server_type;
    _server_address = server_address;

    return send_dns_event();
}

bool M2MConnectionHandlerPimpl::send_dns_event()
{
    tr_debug("send_dns_event()");

    arm_event_s event;

    event.receiver = M2MConnectionHandlerPimpl::_tasklet_id;
    event.sender = 0;
    event.event_type = ESocketDnsHandler;
    event.data_ptr = NULL;
    event.priority = ARM_LIB_HIGH_PRIORITY_EVENT;

    return !eventOS_event_send(&event);
}

void M2MConnectionHandlerPimpl::dns_handler()
{
    palStatus_t status;
    palSocketLength_t _socket_address_len;

    tr_debug("M2MConnectionHandlerPimpl::dns_handler - _socket_state = %d", _socket_state);

    switch (_socket_state) {
        case ESocketStateConnectBeingCalled:
        case ESocketStateCloseBeingCalled:
            // Ignore these events
            break;

        case ESocketStateDisconnected:

            // Initialize the socket to stable state
            close_socket();

            if(PAL_SUCCESS != pal_getAddressInfo(_server_address.c_str(), &_socket_address, &_socket_address_len)){
                _observer.socket_error(M2MConnectionHandler::SOCKET_ABORT);
                return;
            }
            pal_setSockAddrPort(&_socket_address, _server_port);

            if(_network_stack == M2MInterface::LwIP_IPv4 ||
               _network_stack == M2MInterface::ATWINC_IPv4){
                if(PAL_SUCCESS != pal_getSockAddrIPV4Addr(&_socket_address,_ipV4Addr)){
                    _observer.socket_error(M2MConnectionHandler::SOCKET_ABORT);
                    return;
                }

                tr_debug("IP Address %s",tr_array(_ipV4Addr, 4));

                _address._address = (void*)_ipV4Addr;
                _address._length = PAL_IPV4_ADDRESS_SIZE;
                _address._port = _server_port;
                _address._stack = _network_stack;
            }
            else if(_network_stack == M2MInterface::LwIP_IPv6 ||
                    _network_stack == M2MInterface::Nanostack_IPv6){
                if(PAL_SUCCESS != pal_getSockAddrIPV6Addr(&_socket_address,_ipV6Addr)){
                    _observer.socket_error(M2MConnectionHandler::SOCKET_ABORT);
                    return;
                }

                tr_debug("IP Address %s",tr_array(_ipV6Addr,sizeof(_ipV6Addr)));

                _address._address = (void*)_ipV6Addr;
                _address._length = PAL_IPV6_ADDRESS_SIZE;
                _address._port = _server_port;
                _address._stack = _network_stack;
            }
            else {
                tr_error("socket config error, %d", (int)_network_stack);
                _observer.socket_error(M2MConnectionHandler::SOCKET_ABORT);
                return;
            }

            if(!init_socket()) {
                _observer.socket_error(M2MConnectionHandler::SOCKET_ABORT);
                return;
            }

            if(is_tcp_connection()) {
#ifdef PAL_NET_TCP_AND_TLS_SUPPORT
                tr_debug("resolve_server_address - Using TCP");

                // At least on mbed-os the pal_connect() will perform callbacks even during it
                // is called, which we will ignore when this state is set.
                _socket_state = ESocketStateConnectBeingCalled;

                status = pal_connect(_socket, &_socket_address, sizeof(_socket_address));

                if (status == PAL_ERR_SOCKET_IN_PROGRES) {
                    // In this case the connect is done asynchronously, and the pal_socketMiniSelect()
                    // will be used to detect the end of connect.
                    // XXX: the mbed-os version of PAL has a bug (IOTPAL-228) open that the select
                    // does not necessarily work correctly. So, should we actually handle
                    // the PAL_ERR_SOCKET_IN_PROGRESS as a error here if code is compiled for mbed-os?
                    tr_debug("pal_connect(): %d, async connect started", status);
                    // we need to wait for the event
                    _socket_state = ESocketStateConnecting;
                    break;

                } else if (status == PAL_SUCCESS) {

                    tr_info("pal_connect(): success");
                    _running = true;
                    _socket_state = ESocketStateConnected;

                } else {
                    tr_error("pal_connect(): failed: %d", status);
                    close_socket();
                    _observer.socket_error(M2MConnectionHandler::SOCKET_ABORT);
                    return;
                }
#else
                tr_error("dns_handler() - TCP not configured"
#endif //PAL_NET_TCP_AND_TLS_SUPPORT
            } else {
                tr_debug("resolve_server_address - Using UDP");
                _socket_state = ESocketStateConnected;
                _running = true;
            }

        // fall through is a normal flow in case the UDP was used or pal_connect() happened to return immediately with PAL_SUCCESS
        case ESocketStateConnected:
            if (_security) {
                if (_security->resource_value_int(M2MSecurity::SecurityMode) == M2MSecurity::Certificate ||
                    _security->resource_value_int(M2MSecurity::SecurityMode) == M2MSecurity::Psk) {
                    if( _security_impl != NULL ){
                        _security_impl->reset();
                        if (_security_impl->init(_security) == 0) {
                            _is_handshaking = true;
                            tr_debug("resolve_server_address - connect DTLS");
                            if(_security_impl->start_connecting_non_blocking(_base) < 0 ){
                                tr_debug("dns_handler - handshake failed");
                                _is_handshaking = false;
                                close_socket();
                                _observer.socket_error(M2MConnectionHandler::SSL_CONNECTION_ERROR);
                                return;
                            }
                        } else {
                            tr_error("resolve_server_address - init failed");
                            close_socket();
                            _observer.socket_error(M2MConnectionHandler::SSL_CONNECTION_ERROR, false);
                            return;
                        }
                    } else {
                        tr_error("dns_handler - sec is null");
                        close_socket();
                        _observer.socket_error(M2MConnectionHandler::SSL_CONNECTION_ERROR, false);
                        return;
                    }
                }
            }
            if(!_is_handshaking) {
                enable_keepalive();
                _observer.address_ready(_address,
                                        _server_type,
                                        _address._port);
            }
            break;

        // This case is a continuation of a nonblocking connect() and is skipped
        // completely on UDP.
        case ESocketStateConnecting:

            // there is only one socket which we are interested
            uint8_t socketStatus[1];
            pal_timeVal_t zeroTime = {0, 0};
            uint32_t socketsSet = 0;

            status = pal_socketMiniSelect(&_socket, 1, &zeroTime, socketStatus, &socketsSet);
            if (status != PAL_SUCCESS) {
                // XXX: how could this fail? What to do?
                tr_error("dns_handler() - read select fail, err: %d", status);
                close_socket(); // this will also set the socket state to disconnect
                // XXX: should we inform the observer here too?
                return;
            }

            if (socketsSet > 0) {
                if (PAL_NET_SELECT_IS_TX(socketStatus, 0)) {
                    // Socket is connected, signal the dns_handler() again to run rest of the steps
                    tr_debug("dns_handler() - connect+select succeeded");
                    _socket_state = ESocketStateConnected;
                    send_dns_event();
                } else if (PAL_NET_SELECT_IS_ERR(socketStatus, 0)) {
                    tr_error("dns_handler() - connect+select failed");
                    close_socket(); // this will also set the socket state to disconnect
                    // XXX: should we inform the observer here too?
                } else {
                    tr_debug("dns_handler() - connect+select not ready yet, continue waiting");
                }

            }
            break;
    }

}

bool M2MConnectionHandlerPimpl::send_data(uint8_t *data,
                                          uint16_t data_len,
                                          sn_nsdl_addr_s *address)
{
    arm_event_s event;

    tr_debug("send_data()");
    if (address == NULL || data == NULL || !data_len || !_running) {
        tr_warn("send_data() too early");
        return false;
    }

    event.data_ptr = (uint8_t*)malloc(data_len);
    if(!event.data_ptr) {
        return false;
    }
    memcpy(event.data_ptr, data, data_len);

    event.receiver = M2MConnectionHandlerPimpl::_tasklet_id;
    event.sender = 0;
    event.event_type = ESocketSend;
    event.event_data = data_len;
    event.priority = ARM_LIB_HIGH_PRIORITY_EVENT;

    if (eventOS_event_send(&event) != 0) {
        // Event push failed, free the buffer
        free(event.data_ptr);
        return false;
    }

    return true;
}

void M2MConnectionHandlerPimpl::send_socket_data(uint8_t *data, uint16_t data_len)
{
    size_t sent_len;
    bool success = false;
    palStatus_t ret = PAL_ERR_GENERIC_FAILURE;

    if(!data || ! data_len || !_running) {
        tr_warn("send_socket_data() too early");
        return;
    }

    tr_debug("send_handler()");

    if( _use_secure_connection ){
        if( _security_impl->send_message(data, data_len) > 0){
            success = true;
        }
    } else {
        if(is_tcp_connection()){
#ifdef PAL_NET_TCP_AND_TLS_SUPPORT
            //We need to "shim" the length in front
            uint8_t* d = (uint8_t*)malloc(data_len+4);
            if(d){
                d[0] = 0;
                d[1] = 0;
                d[2] = (data_len >> 8 )& 0xff;
                d[3] = data_len & 0xff;
                memcpy(d + 4, data, data_len);
                ret = pal_send(_socket, d, data_len+4, &sent_len);
                free(d);
            }
#endif //PAL_NET_TCP_AND_TLS_SUPPORT
        } else {
            ret = pal_sendTo(_socket, data, data_len, &_socket_address, sizeof(_socket_address), &sent_len);
        }
        if (ret == PAL_SUCCESS) {
            success = true;
        }
        // TODO: the handling of EWOULDBLOCK would be nice
    }

    if (!success) {
        _observer.socket_error(M2MConnectionHandler::SOCKET_SEND_ERROR, true);
        close_socket();
    }
    else{
        _observer.data_sent();
    }
}

bool M2MConnectionHandlerPimpl::start_listening_for_data()
{
    tr_debug("start_listening_for_data()");
    _listening = true;
    return true;
}

void M2MConnectionHandlerPimpl::stop_listening()
{
    tr_debug("stop_listening()");
    _listening = false;

    if(_security_impl) {
        _security_impl->reset();
    }
}

int M2MConnectionHandlerPimpl::send_to_socket(const unsigned char *buf, size_t len)
{
    size_t sent_len = 0;
    palStatus_t status = PAL_ERR_GENERIC_FAILURE;

    if(!_running) {
        tr_warn("send_to_socket NOT RUNNING");
        return (-1);
    }

    tr_debug("send_to_socket len - %d", len);

    if(is_tcp_connection()) {
#ifdef PAL_NET_TCP_AND_TLS_SUPPORT
        status = pal_send(_socket, buf, len, &sent_len);
#endif //PAL_NET_TCP_AND_TLS_SUPPORT
    } else {
        status = pal_sendTo(_socket, buf, len, &_socket_address, sizeof(_socket_address), &sent_len);
    }

    if(status == PAL_SUCCESS){
        return sent_len;
    }

    return (-1);
}

int M2MConnectionHandlerPimpl::receive_from_socket(unsigned char *buf, size_t len)
{
    size_t recv_len;
    palStatus_t status = PAL_ERR_GENERIC_FAILURE;
    tr_debug("receive_from_socket");

    if(!_running) {
        return (-1);
    }

    if(is_tcp_connection()) {
#ifdef PAL_NET_TCP_AND_TLS_SUPPORT
        status = pal_recv(_socket, buf, len, &recv_len);
#endif //PAL_NET_TCP_AND_TLS_SUPPORT
    } else {
        status = pal_receiveFrom(_socket, buf, len, NULL, NULL, &recv_len);
    }

    if(status == PAL_SUCCESS){
        return recv_len;
    }
    else if (status == PAL_ERR_SOCKET_WOULD_BLOCK) {
        return M2MConnectionHandler::CONNECTION_ERROR_WANTS_READ;
    }
    else {
        tr_info("PAL Socket returned: %d", status);
    }

    return (-1);
}

void M2MConnectionHandlerPimpl::handle_connection_error(int error)
{
    tr_debug("handle_connection_error");
    _observer.socket_error(error);
}

void M2MConnectionHandlerPimpl::set_platform_network_handler(void *handler)
{
    tr_debug("set_platform_network_handler");
    if(PAL_SUCCESS != pal_registerNetworkInterface(handler, &_net_iface)) {
        tr_error("Interface registration failed.");
    }
}

void M2MConnectionHandlerPimpl::receive_handshake_handler()
{
    tr_debug("receive_handshake_handler()");
    if( _is_handshaking ){
        int ret = _security_impl->continue_connecting();
        tr_debug("ret %d", ret);
        if( ret == M2MConnectionHandler::CONNECTION_ERROR_WANTS_READ ){ //We wait for next readable event
            tr_debug("We wait for next readable event");
            return;
        } else if( ret == 0 ){
            _is_handshaking = false;
            _use_secure_connection = true;
            enable_keepalive();
            _observer.address_ready(_address,
                                    _server_type,
                                    _server_port);
        } else if( ret < 0 ){
            _is_handshaking = false;
            _observer.socket_error(M2MConnectionHandler::SSL_CONNECTION_ERROR, true);
            close_socket();
        }
    }
}

bool M2MConnectionHandlerPimpl::is_handshake_ongoing()
{
    return _is_handshaking;
}

void M2MConnectionHandlerPimpl::receive_handler()
{
    tr_debug("receive_handler()");
    if(_is_handshaking){
        receive_handshake_handler();
        return;
    }

    if(!_listening || !_running) {
        return;
    }

    if( _use_secure_connection ){
        int rcv_size;
        do{
            rcv_size = _security_impl->read(_recv_buffer, sizeof(_recv_buffer));
            if(rcv_size > 0){
                _observer.data_available((uint8_t*)_recv_buffer,
                                         rcv_size, _address);
            } else if (M2MConnectionHandler::CONNECTION_ERROR_WANTS_READ != rcv_size && rcv_size < 0) {
                _observer.socket_error(M2MConnectionHandler::SOCKET_READ_ERROR, true);
                close_socket();
                return;
            }
        } while(M2MConnectionHandler::CONNECTION_ERROR_WANTS_READ != rcv_size);
    } else{
        size_t recv;
        palStatus_t status;
        do{
            if(is_tcp_connection()){
#ifdef PAL_NET_TCP_AND_TLS_SUPPORT
                status = pal_recv(_socket, _recv_buffer, sizeof(_recv_buffer), &recv);
#endif //PAL_NET_TCP_AND_TLS_SUPPORT
            } else{
                status = pal_receiveFrom(_socket, _recv_buffer, sizeof(_recv_buffer), NULL, NULL, &recv);
            }

            if(status == PAL_ERR_SOCKET_WOULD_BLOCK){
                return;
            }
            else if (status != PAL_SUCCESS) {
                _observer.socket_error(M2MConnectionHandler::SOCKET_READ_ERROR, true);
                close_socket();
                return;
            }

            tr_debug("data received, len: %zu", recv);

            if(!is_tcp_connection()){ // Observer for UDP plain mode
                _observer.data_available((uint8_t*)_recv_buffer, recv, _address);
            } else {
#ifdef PAL_NET_TCP_AND_TLS_SUPPORT
                if( recv < 4 ){
                    _observer.socket_error(M2MConnectionHandler::SOCKET_READ_ERROR, true);
                    close_socket();
                    return;
                }

                //We need to "shim" out the length from the front
                uint32_t len = (_recv_buffer[0] << 24 & 0xFF000000) + (_recv_buffer[1] << 16 & 0xFF0000);
                len += (_recv_buffer[2] << 8 & 0xFF00) + (_recv_buffer[3] & 0xFF);
                if(len > 0 && len <= recv - 4) {
                    // Observer for TCP plain mode
                    _observer.data_available(_recv_buffer + 4, len, _address);
                }
#endif //PAL_NET_TCP_AND_TLS_SUPPORT
            }
        } while(status != PAL_ERR_SOCKET_WOULD_BLOCK);
    }
}

void M2MConnectionHandlerPimpl::claim_mutex()
{
    eventOS_scheduler_mutex_wait();
}

void M2MConnectionHandlerPimpl::release_mutex()
{
    eventOS_scheduler_mutex_release();
}

static palNetInterfaceInfo_t interface_info;
static palIpV4Addr_t interface_address4 = {0,0,0,0};
static palIpV6Addr_t interface_address6 = {0};

bool M2MConnectionHandlerPimpl::init_socket()
{
    tr_debug("init_socket - IN");
    _is_handshaking = false;
    _running = true;
    palSocketType_t socket_type = PAL_SOCK_DGRAM;
    palStatus_t status;
    palSocketDomain_t domain;
    palSocketAddress_t bind_address;

    if(is_tcp_connection()) {
#ifdef PAL_NET_TCP_AND_TLS_SUPPORT
        socket_type = PAL_SOCK_STREAM;
#else
        _observer.socket_error(M2MConnectionHandler::SOCKET_ABORT);
        return;
#endif //PAL_NET_TCP_AND_TLS_SUPPORT
    }

    if(_network_stack == M2MInterface::LwIP_IPv4){
        domain = PAL_AF_INET;
    } else if(_network_stack == M2MInterface::LwIP_IPv6){
        domain = PAL_AF_INET6;
    } else {
        domain = PAL_AF_UNSPEC;
    }

    uint32_t interface_count;
    pal_getNumberOfNetInterfaces(&interface_count);
    tr_debug("Interface count: %d",interface_count);
    pal_getNetInterfaceInfo(_net_iface, &interface_info);
    tr_debug("Interface name: %s",interface_info.interfaceName);
    tr_debug("Interface no: %d", _net_iface);
    tr_debug("init_socket - port %d", _listen_port);

    status = pal_asynchronousSocket(domain, socket_type, 1, _net_iface, &socket_event_handler, &_socket);

    if(PAL_SUCCESS != status) {
        _observer.socket_error(M2MConnectionHandler::SOCKET_ABORT);
        return false;
    }

    if(_network_stack == M2MInterface::LwIP_IPv4){
        pal_setSockAddrIPV4Addr(&bind_address, interface_address4);
    } else if(_network_stack == M2MInterface::LwIP_IPv6){
        pal_setSockAddrIPV6Addr(&bind_address, interface_address6);
    }

    pal_setSockAddrPort(&bind_address, _listen_port);
    pal_bind(_socket, &bind_address, sizeof(bind_address));

    tr_debug("init_socket - OUT");
    return true;
}

bool M2MConnectionHandlerPimpl::is_tcp_connection()
{
    return ( _binding_mode == M2MInterface::TCP ||
             _binding_mode == M2MInterface::TCP_QUEUE );
}

void M2MConnectionHandlerPimpl::close_socket()
{
    tr_debug("close_socket() - IN");

    palStatus_t status = PAL_SUCCESS;
    if (_socket) {
        // At least on mbed-os the pal_close() will perform callbacks even during it
        // is called, which we will ignore when this state is set.
        _socket_state = ESocketStateCloseBeingCalled;
        status = pal_close(&_socket);
    }

    // make sure the socket connection statemachine is reset too.
    _socket_state = ESocketStateDisconnected;

    tr_debug("close_socket() - status: %d OUT", (int)status);
}

void M2MConnectionHandlerPimpl::enable_keepalive()
{
#if MBED_CLIENT_TCP_KEEPALIVE_TIME
#ifdef PAL_NET_TCP_AND_TLS_SUPPORT
    if(is_tcp_connection()) {
        int enable = 1;
        pal_setSocketOptions(_socket, PAL_SO_KEEPALIVE, &enable, sizeof(enable));
    }
#endif
#endif
}
