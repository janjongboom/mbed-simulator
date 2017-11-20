/*
* Copyright (c) 2016 ARM Limited. All rights reserved.
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


#include "pal.h"
#include "pal_network.h"
#include "pal_plat_network.h"

typedef struct pal_in_addr {
    uint32_t s_addr; // that's a 32-bit int (4 bytes)
} pal_in_addr_t;

typedef struct pal_socketAddressInternal {
    short int          pal_sin_family;  // address family
    unsigned short int pal_sin_port;    // port
    pal_in_addr_t     pal_sin_addr;    // ipv4 address
    unsigned char      pal_sin_zero[8]; // 
} pal_socketAddressInternal_t;

typedef struct pal_socketAddressInternal6{
    uint16_t       pal_sin6_family;   // address family, 
    uint16_t       pal_sin6_port;     // port number, Network Byte Order
    uint32_t       pal_sin6_flowinfo; // IPv6 flow information
    palIpV6Addr_t pal_sin6_addr;     // IPv6 address
    uint32_t       pal_sin6_scope_id; // Scope ID
} pal_socketAddressInternal6_t;



palStatus_t pal_registerNetworkInterface(void* networkInterfaceContext, uint32_t* interfaceIndex)
{
    palStatus_t result = PAL_SUCCESS;
    result = pal_plat_RegisterNetworkInterface(networkInterfaceContext, interfaceIndex);
    return result;
}


palStatus_t pal_setSockAddrPort(palSocketAddress_t* address, uint16_t port)
{
    palStatus_t result = PAL_SUCCESS;
    if (NULL == address)
    {
        return PAL_ERR_RTOS_PARAMETER;
    }

    if (address->addressType == PAL_AF_INET)
    {
        pal_socketAddressInternal_t* innerAddr = (pal_socketAddressInternal_t*)address;
        innerAddr->pal_sin_port = port;
    }
    else  if (address->addressType == PAL_AF_INET6)
    {
        pal_socketAddressInternal6_t * innerAddr = (pal_socketAddressInternal6_t*)address;
        innerAddr->pal_sin6_port = port;
    }
    else
    {
        result =  PAL_ERR_SOCKET_INVALID_ADDRESS_FAMILY;
    }
    
    return result;
}


palStatus_t pal_setSockAddrIPV4Addr(palSocketAddress_t* address, palIpV4Addr_t ipV4Addr)
{
    if ((NULL == address) || (NULL == ipV4Addr))
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    pal_socketAddressInternal_t* innerAddr = (pal_socketAddressInternal_t*)address;
    innerAddr->pal_sin_family = PAL_AF_INET;
    innerAddr->pal_sin_addr.s_addr = (ipV4Addr[0]) | (ipV4Addr[1] << 8) | (ipV4Addr[2] << 16) | (ipV4Addr[3] << 24);
    return PAL_SUCCESS;
}


palStatus_t pal_setSockAddrIPV6Addr(palSocketAddress_t* address, palIpV6Addr_t ipV6Addr)
{
    int index;

    if ((NULL == address) || (NULL == ipV6Addr))
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    pal_socketAddressInternal6_t* innerAddr = (pal_socketAddressInternal6_t*)address;
    innerAddr->pal_sin6_family = PAL_AF_INET6;
    for (index = 0; index < PAL_IPV6_ADDRESS_SIZE; index++) // TODO: use mem copy?
    {
        innerAddr->pal_sin6_addr[index] =  ipV6Addr[index];
    }
    return PAL_SUCCESS;
}


palStatus_t pal_getSockAddrIPV4Addr(const palSocketAddress_t* address, palIpV4Addr_t ipV4Addr)
{
    palStatus_t result = PAL_SUCCESS;
    if (NULL == address)
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    if (address->addressType == PAL_AF_INET)
    {
        pal_socketAddressInternal_t* innerAddr = (pal_socketAddressInternal_t*)address;
        ipV4Addr[0] = (innerAddr->pal_sin_addr.s_addr) & 0xFF;
        ipV4Addr[1] = (innerAddr->pal_sin_addr.s_addr >> 8) & 0xFF;
        ipV4Addr[2] = (innerAddr->pal_sin_addr.s_addr >> 16) & 0xFF;
        ipV4Addr[3] = (innerAddr->pal_sin_addr.s_addr >> 24) & 0xFF;

    }
    else
    {
        result =  PAL_ERR_SOCKET_INVALID_ADDRESS_FAMILY;
    }
    return result;
}


palStatus_t pal_getSockAddrIPV6Addr(const palSocketAddress_t* address, palIpV6Addr_t ipV6Addr)
{ 
    palStatus_t result = PAL_SUCCESS;
    int index = 0;
    if (address->addressType == PAL_AF_INET6)
    {
        pal_socketAddressInternal6_t * innerAddr = (pal_socketAddressInternal6_t*)address;
        for (index = 0; index < PAL_IPV6_ADDRESS_SIZE; index++) // TODO: use mem copy?
        {
            ipV6Addr[index] = innerAddr->pal_sin6_addr[index];
        }
    }
    else
    {
        result =  PAL_ERR_SOCKET_INVALID_ADDRESS_FAMILY;
    }
    return result;
}


palStatus_t pal_getSockAddrPort(const palSocketAddress_t* address, uint16_t* port)
{
    palStatus_t result = PAL_SUCCESS;
    if ((NULL == address) || (NULL == port))
    {
        return PAL_ERR_RTOS_PARAMETER;
    }

    if (address->addressType == PAL_AF_INET)
    {
        pal_socketAddressInternal_t* innerAddr = (pal_socketAddressInternal_t*)address;
        *port = innerAddr->pal_sin_port;
    }
    else  if (address->addressType == PAL_AF_INET6)
    {
        pal_socketAddressInternal6_t * innerAddr = (pal_socketAddressInternal6_t*)address;
        *port = innerAddr->pal_sin6_port;
    }
    else
    {
        result =  PAL_ERR_SOCKET_INVALID_ADDRESS_FAMILY;
    }

    return result;
}


palStatus_t pal_socket(palSocketDomain_t domain, palSocketType_t type, bool nonBlockingSocket, uint32_t interfaceNum, palSocket_t* socket)
{
    palStatus_t result = PAL_SUCCESS;
    if (NULL == socket)
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    result =  pal_plat_socket(domain, type, nonBlockingSocket, interfaceNum, socket);
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)
}


palStatus_t pal_getSocketOptions(palSocket_t socket, palSocketOptionName_t optionName, void* optionValue, palSocketLength_t* optionLength)
{
    palStatus_t result = PAL_SUCCESS;
    if ((NULL == optionValue) || (NULL == optionLength))
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    result = pal_plat_getSocketOptions(socket, optionName, optionValue, optionLength);
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)
}


palStatus_t pal_setSocketOptions(palSocket_t socket, int optionName, const void* optionValue, palSocketLength_t optionLength)
{
    palStatus_t result = PAL_SUCCESS;
    if (NULL == optionValue)
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    result = pal_plat_setSocketOptions( socket,  optionName, optionValue,  optionLength);
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)
}


palStatus_t pal_bind(palSocket_t socket, palSocketAddress_t* myAddress, palSocketLength_t addressLength)
{
    palStatus_t result = PAL_SUCCESS;
    if (NULL == myAddress)
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    result = pal_plat_bind(socket, myAddress, addressLength);
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)
}


palStatus_t pal_receiveFrom(palSocket_t socket, void* buffer, size_t length, palSocketAddress_t* from, palSocketLength_t* fromLength, size_t* bytesReceived)
{
    palStatus_t result = PAL_SUCCESS;
    if ((NULL == buffer) || (NULL == bytesReceived))
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    result = pal_plat_receiveFrom(socket,  buffer,  length,  from, fromLength, bytesReceived);
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)    
}


palStatus_t pal_sendTo(palSocket_t socket, const void* buffer, size_t length, const palSocketAddress_t* to, palSocketLength_t toLength, size_t* bytesSent)
{
    palStatus_t result = PAL_SUCCESS;
    if ((NULL == buffer) || (NULL == bytesSent) || (NULL == to))
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    result = pal_plat_sendTo(socket, buffer, length, to, toLength, bytesSent);
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)
}


palStatus_t pal_close(palSocket_t* socket)
{
    palStatus_t result = PAL_SUCCESS;
    if (NULL == socket )
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    result = pal_plat_close(socket);
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)
}


palStatus_t pal_getNumberOfNetInterfaces( uint32_t* numInterfaces)
{
    palStatus_t result = PAL_SUCCESS;
    if (NULL == numInterfaces)
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    result = pal_plat_getNumberOfNetInterfaces(numInterfaces);
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)
}


palStatus_t pal_getNetInterfaceInfo(uint32_t interfaceNum, palNetInterfaceInfo_t * interfaceInfo)
{
    palStatus_t result = PAL_SUCCESS;
    
    if (NULL == interfaceInfo)
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    result = pal_plat_getNetInterfaceInfo(interfaceNum, interfaceInfo);
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)
}


palStatus_t pal_socketMiniSelect(const palSocket_t socketsToCheck[PAL_NET_SOCKET_SELECT_MAX_SOCKETS], uint32_t numberOfSockets,
    pal_timeVal_t* timeout, uint8_t palSocketStatus[PAL_NET_SOCKET_SELECT_MAX_SOCKETS], uint32_t * numberOfSocketsSet)
{
    palStatus_t result = PAL_SUCCESS;
    if ((NULL == socketsToCheck) || (NULL == numberOfSocketsSet) || (PAL_NET_SOCKET_SELECT_MAX_SOCKETS < numberOfSockets))
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    result = pal_plat_socketMiniSelect(socketsToCheck, numberOfSockets, timeout, palSocketStatus, numberOfSocketsSet);
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)
}


#if PAL_NET_TCP_AND_TLS_SUPPORT // functionality below supported only in case TCP is supported.

palStatus_t pal_listen(palSocket_t socket, int backlog)
{
    palStatus_t result = PAL_SUCCESS;
    result = pal_plat_listen(socket, backlog);
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)
}


palStatus_t pal_accept(palSocket_t socket, palSocketAddress_t* address, palSocketLength_t* addressLen, palSocket_t* acceptedSocket)
{
    palStatus_t result = PAL_SUCCESS;
    if ((NULL == acceptedSocket) || (NULL == address)|| (NULL == addressLen))
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    result = pal_plat_accept(socket,  address, addressLen,  acceptedSocket);
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)
}


palStatus_t pal_connect(palSocket_t socket, const palSocketAddress_t* address, palSocketLength_t addressLen)
{
    palStatus_t result = PAL_SUCCESS;
    if (NULL == address)
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    result = pal_plat_connect( socket, address, addressLen);
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)
}


palStatus_t pal_recv(palSocket_t socket, void* buf, size_t len, size_t* recievedDataSize)
{
    palStatus_t result = PAL_SUCCESS;
    if ((NULL == recievedDataSize) ||  (NULL == recievedDataSize))
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    result = pal_plat_recv(socket, buf, len, recievedDataSize);
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)
}


palStatus_t pal_send(palSocket_t socket, const void* buf, size_t len, size_t* sentDataSize)
{
    palStatus_t result = PAL_SUCCESS;
    if ((NULL == buf) || (NULL == sentDataSize))
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    result = pal_plat_send( socket, buf, len, sentDataSize);
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)
}


#endif //PAL_NET_TCP_AND_TLS_SUPPORT


#if PAL_NET_ASYNCHRONOUS_SOCKET_API

palStatus_t pal_asynchronousSocket(palSocketDomain_t domain, palSocketType_t type, bool nonBlockingSocket, uint32_t interfaceNum, palAsyncSocketCallback_t callback, palSocket_t* socket)
{
    palStatus_t result = PAL_SUCCESS;
    if ((NULL == socket) || (NULL == callback))
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    result = pal_plat_asynchronousSocket(domain,  type,  nonBlockingSocket,  interfaceNum,  callback, socket);
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)
}

#endif

#if PAL_NET_DNS_SUPPORT

palStatus_t pal_getAddressInfo(const char *url, palSocketAddress_t *address, palSocketLength_t* addressLength)
{
    palStatus_t result = PAL_SUCCESS;
    if ((NULL == url) || (NULL == address) || (NULL == addressLength))
    {
        return PAL_ERR_RTOS_PARAMETER;
    }
    result = pal_plat_getAddressInfo(url, address, addressLength);
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)
}

#endif





