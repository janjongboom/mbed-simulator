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
#ifndef M2M_CONNECTION_HANDLER_PIMPL_H__
#define M2M_CONNECTION_HANDLER_PIMPL_H__

#include "ns_types.h"
#include "mbed-client/m2mconfig.h"
#include "mbed-client/m2mconstants.h"
#include "mbed-client/m2minterface.h"
#include "mbed-client/m2mconnectionobserver.h"
#include "mbed-client/m2mconnectionsecurity.h"
#include "nsdl-c/sn_nsdl.h"

#include "pal_network.h"


class M2MConnectionSecurity;
class M2MConnectionHandler;
class M2MSecurity;

/**
 * @brief M2MConnectionHandlerPimpl.
 * This class handles the socket connection for LWM2M Client
 */


class M2MConnectionHandlerPimpl {
public:

    enum SocketEvent {
        ESocketIdle         = 0x00,
        ESocketReadytoRead  = 0x02,
        ESocketDnsHandler   = 0x04,
        ESocketSend         = 0x08
    };

    struct TaskIdentifier {
        M2MConnectionHandlerPimpl *pimpl;
        void                      *data_ptr;
    };

    /**
    * @brief Constructor
    */
    M2MConnectionHandlerPimpl(M2MConnectionHandler* base, M2MConnectionObserver &observer,
                              M2MConnectionSecurity* sec,
                              M2MInterface::BindingMode mode,
                              M2MInterface::NetworkStack stack);

    /**
    * @brief Destructor
    */
    ~M2MConnectionHandlerPimpl();

    void start_timer(void);

    /**
    * @brief This binds the socket connection.
    * @param listen_port Port to listen for incoming connection.
    * @return true if successful else false.
    */
    bool bind_connection(const uint16_t listen_port);

    /**
    * @brief This resolves the server address. Output is
    * returned through callback
    * @param String server address.
    * @param uint16_t Server port.
    * @param ServerType, Server Type to be resolved.
    * @return true if address is valid else false.
    */
    bool resolve_server_address(const String& server_address,
                                const uint16_t server_port,
                                M2MConnectionObserver::ServerType server_type,
                                const M2MSecurity* security);

    /**
    * @brief Sends data, to the connected sent to server.
    * @param data, Data to be sent.
    */
    bool send_data(uint8_t *data_ptr,
                   uint16_t data_len,
                   sn_nsdl_addr_s *address_ptr);

    /**
    * @brief Listens for incoming data from remote server
    * @return true if successful else false.
    */
    bool start_listening_for_data();

    /**
    * @brief Stops listening for incoming data
    */
    void stop_listening();

    /**
     * @brief send_to_socket Sends directly to socket. This is used by
     * security classes to send after data has been encrypted.
     * @param buf Buffer to send
     * @param len Length of a buffer
     * @return Number of bytes sent or -1 if failed
     */
    int send_to_socket(const unsigned char *buf, size_t len);

    /**
     * \brief Receives directly from the socket. This
     * is used by the security classes to receive raw data to be decrypted.
     * \param buf Buffer to send.
     * \param len The length of the buffer.
     * \param timeout Timeout defined from DTLS to wait for blocking receive calls
     * before timing out, by default value is 0.
     * \return Number of bytes read or negative number if failed.
     */
    int receive_from_socket(unsigned char *buf, size_t len);

    /**
    * @brief Error handling for DTLS connectivity.
    * @param error, Error code from TLS library
    */
    void handle_connection_error(int error);

    /**
     * \brief Sets the network interface handler that is used by client to connect
     * to a network over IP..
     * \param handler A network interface handler that is used by client to connect.
     *  This API is optional but provides a mechanism for different platforms to
     * manage usage of underlying network interface by client.
     */
    void set_platform_network_handler(void *handler = NULL);

    /**
    * \brief Claims mutex to prevent thread clashes
    * in multithreaded environment.
    */
    void claim_mutex();

    /**
    * \brief Releases mutex to prevent thread clashes
    * in multithreaded environment.
    */
    void release_mutex();

    /**
    * @brief Callback handler for sending data over socket.
    */
    void send_handler();

    /**
    * @brief Callback handler for receiving data over socket.
    */
    void receive_handler();

    /**
    * @brief Callback handler for receiving data for secured connection.
    */
    void receive_handshake_handler();

    /**
    * @brief Returns true if DTLS handshake is still ongoing.
    */
    bool is_handshake_ongoing();

    /**
    * @brief Returns connection handler tasklet ID.
    */
    int8_t connection_tasklet_handler();

    /**
    * @brief Handles DNS resolving through event loop.
    */
    void dns_handler();

    /**
    * @brief Sends data to socket through event loop.
    */
    void send_socket_data(uint8_t *data, uint16_t data_len);

    void send_receive_event(void);


private:

    /**
    * @brief Callback handler for socket events.
    */
    void socket_event();

    /**
    * @brief Initialize mbed OS socket
    */
    bool init_socket();

    /**
    * @brief Check socket type
    * @return True if TCP connection otherwise false
    */
    bool is_tcp_connection();

    /**
    * @brief Close and delete socket
    */
    void close_socket();

    /**
    * @brief Enables keepalive for TCP connections.
    */
    void enable_keepalive();

    /**
     * @brief Internal helper for sending a event that will wake up dns_handler().
     */
    static bool send_dns_event();

private:
    enum SocketState {
        /** Socket has not been intialized/connected yet. */
        ESocketStateDisconnected,

        /** pal_connect() is in progress. */
        ESocketStateConnectBeingCalled,

        /** pal_close() is in progress. */
        ESocketStateCloseBeingCalled,

        /** pal_connect() has been called and we are waiting for asynchronous response. */
        ESocketStateConnecting,

        /** pal_connect is complete and the DTLS handshake is to be done. */
        ESocketStateConnected
    };

    M2MConnectionHandler                        *_base;
    M2MConnectionObserver                       &_observer;
    M2MConnectionSecurity                       *_security_impl; //owned
    const M2MSecurity                           *_security; //non-owned
    bool                                        _use_secure_connection;
    M2MInterface::BindingMode                   _binding_mode;
    M2MInterface::NetworkStack                  _network_stack;
    M2MConnectionObserver::SocketAddress        _address;

    // _address._address will point to one of these two
    palIpV4Addr_t                               _ipV4Addr;
    palIpV6Addr_t                               _ipV6Addr;

    palSocket_t                                 _socket;
    bool                                        _is_handshaking;
    bool                                        _listening;
    M2MConnectionObserver::ServerType           _server_type;
    uint16_t                                    _server_port;
    uint16_t                                    _listen_port;
    bool                                        _running;
    unsigned char                               _recv_buffer[BUFFER_LENGTH];
    uint32_t                                    _net_iface;
    palSocketAddress_t                          _socket_address;
    static int8_t                               _tasklet_id;
    String                                      _server_address;

    // A state variable for the socket itself, which is needed to handle the
    // asynchronous events and callbacks. Note: the state may be accessed from
    // event sender and receiver threads.
    volatile SocketState                        _socket_state;

friend class Test_M2MConnectionHandlerPimpl;
friend class Test_M2MConnectionHandlerPimpl_mbed;
friend class Test_M2MConnectionHandlerPimpl_classic;
friend class M2MConnection_TestObserver;
};

#endif //M2M_CONNECTION_HANDLER_PIMPL_H__
