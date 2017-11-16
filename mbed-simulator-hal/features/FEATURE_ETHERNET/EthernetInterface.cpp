#include <stdio.h>
#include "EthernetInterface.h"
#include "emscripten.h"

EthernetInterface::EthernetInterface() {
    memset(_cbs, 0, sizeof(_cbs));
}

nsapi_error_t EthernetInterface::set_network(const char *ip_address, const char *netmask, const char *gateway) {
    printf("EthernetInterface::set_network is not supported\n");

    return NSAPI_ERROR_OK;
}
nsapi_error_t EthernetInterface::set_dhcp(bool dhcp) {
    printf("EthernetInterface::set_dhcp is not supported\n");

    return NSAPI_ERROR_OK;
}

nsapi_error_t EthernetInterface::connect() {
    // immediately return OK
    return NSAPI_ERROR_OK;
}

nsapi_error_t EthernetInterface::disconnect() {
    return NSAPI_ERROR_OK;
}

const char * EthernetInterface::get_mac_address() {
    return (const char*)EM_ASM_INT({
        return window.MbedJSHal.network.get_mac_address();
    }, 0);
}
const char * EthernetInterface::get_ip_address() {
    return (const char*)EM_ASM_INT({
        return window.MbedJSHal.network.get_ip_address();
    }, 0);
}
const char * EthernetInterface::get_netmask() {
    return (const char*)EM_ASM_INT({
        return window.MbedJSHal.network.get_netmask();
    }, 0);
}
const char * EthernetInterface::get_gateway() {
    return 0;
}

int EthernetInterface::socket_open(void **handle, nsapi_protocol_t proto) {
    struct simulated_socket *socket = new struct simulated_socket();

    int socket_id = EM_ASM_INT({
        return window.MbedJSHal.network.socket_open($0);
    }, proto);

    if (socket_id == -1) {
        return -3001;
    }

    socket->id = socket_id;
    socket->connected = false;
    socket->proto = proto;

    *handle = socket;

    return NSAPI_ERROR_OK;
}

void EthernetInterface::socket_attach(void *handle, void (*callback)(void *), void *data)
{
    struct simulated_socket *socket = (struct simulated_socket *)handle;
    _cbs[socket->id].callback = callback;
    _cbs[socket->id].data = data;
}

int EthernetInterface::socket_close(void *handle)
{
    struct simulated_socket *socket = (struct simulated_socket *)handle;

    int ret = EM_ASM_INT({
        return window.MbedJSHal.network.socket_close($0);
    }, socket->id);

    socket->connected = false;
    delete socket;
    return ret;
}

int EthernetInterface::socket_sendto(void *handle, const SocketAddress &addr, const void *data, unsigned size)
{
    struct simulated_socket *socket = (struct simulated_socket *)handle;

    if (socket->connected && socket->addr != addr) {
        printf("EthernetInterface::socket_sendto trying to send to different address than where connected to\n");
        return NSAPI_ERROR_DEVICE_ERROR;
    }

    if (!socket->connected) {
        int err = socket_connect(socket, addr);
        if (err < 0) {
            return err;
        }
        socket->addr = addr;
    }

    return socket_send(socket, data, size);
}

int EthernetInterface::socket_send(void *handle, const void *data, unsigned size)
{
    struct simulated_socket *socket = (struct simulated_socket *)handle;

    int ret = EM_ASM_INT({
        return window.MbedJSHal.network.socket_send($0, $1, $2);
    }, socket->id, (uint32_t)data, size);

    return ret;
}

int EthernetInterface::socket_connect(void *handle, const SocketAddress &addr)
{
    struct simulated_socket *socket = (struct simulated_socket *)handle;

    int ret = EM_ASM_INT({
        return window.MbedJSHal.network.socket_connect($0, $1, $2);
    }, socket->id, (uint32_t)addr.get_ip_address(), addr.get_port());

    if (ret != 0) {
        return NSAPI_ERROR_DEVICE_ERROR;
    }

    socket->connected = true;
    return 0;
}

int EthernetInterface::socket_recvfrom(void *handle, SocketAddress *addr, void *data, unsigned size)
{
    struct simulated_socket *socket = (struct simulated_socket *)handle;
    int ret = socket_recv(socket, data, size);
    if (ret >= 0 && addr) {
        *addr = socket->addr;
    }

    return ret;
}

int EthernetInterface::socket_recv(void *handle, void *data, unsigned size)
{
    struct simulated_socket *socket = (struct simulated_socket *)handle;

    int recv = EM_ASM_INT({
        return window.MbedJSHal.network.socket_recv($0, $1, $2);
    }, socket->id, (uint32_t)data, size);

    if (recv < 0) {
        return NSAPI_ERROR_WOULD_BLOCK;
    }

    return recv;
}

int EthernetInterface::socket_bind(void *handle, const SocketAddress &address)
{
    return NSAPI_ERROR_UNSUPPORTED;
}

int EthernetInterface::socket_listen(void *handle, int backlog)
{
    return NSAPI_ERROR_UNSUPPORTED;
}

int EthernetInterface::socket_accept(void *handle, void **socket, SocketAddress *address)
{
    return NSAPI_ERROR_UNSUPPORTED;
}

