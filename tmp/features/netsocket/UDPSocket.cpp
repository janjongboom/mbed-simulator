/* Socket
 * Copyright (c) 2015 ARM Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include "UDPSocket.h"
#include "mbed_assert.h"

#define TCP_EVENT           "UDP_Events"
#define READ_FLAG           0x1u
#define WRITE_FLAG          0x2u

UDPSocket::UDPSocket()
    : _pending(0)
{
}

UDPSocket::~UDPSocket()
{
    close();
}

nsapi_protocol_t UDPSocket::get_proto()
{
    return NSAPI_UDP;
}

nsapi_size_or_error_t UDPSocket::sendto(const char *host, uint16_t port, const void *data, nsapi_size_t size)
{
    SocketAddress address;
    nsapi_size_or_error_t err = _stack->gethostbyname(host, &address);
    if (err) {
        return NSAPI_ERROR_DNS_FAILURE;
    }

    address.set_port(port);

    // sendto is thread safe
    return sendto(address, data, size);
}

nsapi_size_or_error_t UDPSocket::sendto(const SocketAddress &address, const void *data, nsapi_size_t size)
{
    nsapi_size_or_error_t ret;

    while (true) {
        if (!_socket) {
            ret = NSAPI_ERROR_NO_SOCKET;
            break;
        }

        _pending = 0;
        nsapi_size_or_error_t sent = _stack->socket_sendto(_socket, address, data, size);
        ret = sent;
        break;
    }

    return ret;
}

nsapi_size_or_error_t UDPSocket::recvfrom(SocketAddress *address, void *buffer, nsapi_size_t size)
{
    nsapi_size_or_error_t ret;

    while (true) {
        if (!_socket) {
            ret = NSAPI_ERROR_NO_SOCKET;
            break;
        }

        _pending = 0;
        nsapi_size_or_error_t recv = _stack->socket_recvfrom(_socket, address, buffer, size);
        ret = recv;
        break;
    }

    return ret;
}

void UDPSocket::event()
{
    _pending += 1;
    if (_callback && _pending == 1) {
        _callback();
    }
}
