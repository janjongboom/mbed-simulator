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
#include "pal_plat_network.h"
#include "pal_rtos.h"

#include "mbed.h"


#if defined (__CC_ARM) || defined(__IAR_SYSTEMS_ICC__)


void palSelectCallbackNull()
{
}

#define NULL_FUNCTION palSelectCallbackNull


#elif defined (__GNUC__)

#define NULL_FUNCTION NULL

#endif


#define PAL_SOCKET_OPTION_ERROR (-1)

static NetworkInterface* s_pal_networkInterfacesSupported[PAL_MAX_SUPORTED_NET_INTEFACES] = { 0 };

static  uint32_t s_pal_numberOFInterfaces = 0;

static  uint32_t s_pal_network_initialized = 0;

static palStatus_t translateErrorToPALError(int errnoValue)
{
    palStatus_t status;
    switch (errnoValue)
    {
    case NSAPI_ERROR_NO_MEMORY:
        status = PAL_ERR_NO_MEMORY;
        break;
    case NSAPI_ERROR_PARAMETER:
        status = PAL_ERR_SOCKET_INVALID_VALUE;
        break;
    case NSAPI_ERROR_WOULD_BLOCK:
        status = PAL_ERR_SOCKET_WOULD_BLOCK;
        break;
    case NSAPI_ERROR_DNS_FAILURE:
        status = PAL_ERR_SOCKET_DNS_ERROR;
        break;
    case NSAPI_ERROR_DHCP_FAILURE:
        status = PAL_ERR_SOCKET_HDCP_ERROR;
        break;
    case NSAPI_ERROR_AUTH_FAILURE:
        status = PAL_ERR_SOCKET_AUTH_ERROR;
        break;
    case NSAPI_ERROR_NO_ADDRESS:
        status = PAL_ERR_SOCKET_INVALID_ADDRESS;
        break;
    case NSAPI_ERROR_NO_CONNECTION:
        status = PAL_ERR_SOCKET_NOT_CONNECTED;
        break;
    case NSAPI_ERROR_DEVICE_ERROR:
        status = PAL_ERR_SOCKET_INPUT_OUTPUT_ERROR;
        break;
    case NSAPI_ERROR_UNSUPPORTED:
        status = PAL_ERR_NOT_SUPPORTED;
        break;

    default:
        status = PAL_ERR_SOCKET_GENERIC;
        break;
    }
    return status;
}

palStatus_t pal_plat_socketsInit(void* context)
{
    (void)context; // replace with macro
    int result = PAL_SUCCESS;
    if (s_pal_network_initialized == 1)
    {
        return PAL_SUCCESS; // already initialized.
    }

    s_pal_network_initialized = 1;

    return result;
}

palStatus_t pal_plat_RegisterNetworkInterface(void* context, uint32_t* interfaceIndex)
{
    palStatus_t result = PAL_SUCCESS;
    uint32_t index = 0;
    uint32_t found = 0;
    if (NULL != context) // TODO: nirson01 : not thread safe - do we need to fix his?
    {
        for (index = 0; index < s_pal_numberOFInterfaces; index++) // if specific context already registered return exisitng index instead of registering again.
        {
            if (s_pal_networkInterfacesSupported[index] == context)
            {
                found = 1;
                if (interfaceIndex != NULL)
                {
                    *interfaceIndex = index;
                }
            }
        }
        if (0 == found)
        {
            s_pal_networkInterfacesSupported[s_pal_numberOFInterfaces] = (NetworkInterface*)context;
            if (interfaceIndex != NULL)
            {
                *interfaceIndex = s_pal_numberOFInterfaces;
            }
            s_pal_numberOFInterfaces = s_pal_numberOFInterfaces + 1;
        }


    }
    else
    {
        result = PAL_ERR_INVALID_ARGUMENT;
    }
    return result;
}

palStatus_t pal_plat_socketsTerminate(void* context)
{
    (void)context; // replace with macro
    return PAL_SUCCESS;
}

static int translateNSAPItoPALSocketOption(int option)
{
    int optionVal = PAL_SOCKET_OPTION_ERROR;
    switch (option)
    {
    case PAL_SO_REUSEADDR:
        optionVal = NSAPI_REUSEADDR;
        break;
#if PAL_NET_TCP_AND_TLS_SUPPORT // socket options below supported only if TCP is supported.
    case PAL_SO_KEEPALIVE:
        optionVal = NSAPI_KEEPALIVE;
        break;
#endif //PAL_NET_TCP_AND_TLS_SUPPORT
    case PAL_SO_SNDTIMEO:
    case PAL_SO_RCVTIMEO:
    default:
        optionVal = PAL_SOCKET_OPTION_ERROR;
    }
    return optionVal;
}


static palStatus_t palSockAddrToSocketAddress(const palSocketAddress_t* palAddr, int length, SocketAddress& output)
{
    palStatus_t result = PAL_SUCCESS;
    uint16_t port = 0;
    nsapi_version_t version = NSAPI_IPv4;

    result = pal_getSockAddrPort(palAddr, &port);
    if (result != PAL_SUCCESS)
    {
        return result;
    }
    output.set_port(port);

    if (PAL_AF_INET == palAddr->addressType)
    {
        palIpV4Addr_t ipV4Addr;
        version = NSAPI_IPv4;
        result = pal_getSockAddrIPV4Addr(palAddr, ipV4Addr);
        if (result == PAL_SUCCESS)
        {
            output.set_ip_bytes(&ipV4Addr, version);
        }
    }
    else if (PAL_AF_INET6 == palAddr->addressType)
    {
        palIpV6Addr_t ipV6Addr;
        version = NSAPI_IPv6;
        result = pal_getSockAddrIPV6Addr(palAddr, ipV6Addr);
        if (result == PAL_SUCCESS)
        {
            output.set_ip_bytes(&ipV6Addr, version);
        }
    }

    return result;
}

static palStatus_t socketAddressToPalSockAddr(SocketAddress& input, palSocketAddress_t* out, palSocketLength_t* length)
{
    palStatus_t result = PAL_SUCCESS;
    int index = 0;
    if (input.get_ip_version() == NSAPI_IPv4)
    {
        palIpV4Addr_t addr;
        const void* tmp = input.get_ip_bytes();
        for (index = 0; index < PAL_IPV4_ADDRESS_SIZE; index++)
        {
            addr[index] = ((const uint8_t*)tmp)[index];
        }
        result = pal_setSockAddrIPV4Addr(out, addr);
        *length = PAL_IPV4_ADDRESS_SIZE;  // TODO: check

    }
    else if (input.get_ip_version() == NSAPI_IPv6)
    {
        palIpV6Addr_t addr;
        const void* tmp = input.get_ip_bytes();
        for (index = 0; index < PAL_IPV6_ADDRESS_SIZE; index++)
        {
            addr[index] = ((const uint8_t*)tmp)[index];
        }
        result = pal_setSockAddrIPV6Addr(out, addr);
        *length = PAL_IPV6_ADDRESS_SIZE;  // TODO: check
    }
    else
    {
        result = PAL_ERR_SOCKET_INVALID_ADDRESS_FAMILY;
    }

    if (result == PAL_SUCCESS)
    {
        result = pal_setSockAddrPort(out, input.get_port());
    }
    return result;
}




palStatus_t pal_plat_socket(palSocketDomain_t domain, palSocketType_t type, bool nonBlockingSocket, uint32_t interfaceNum, palSocket_t* socket)
{
    int result = PAL_SUCCESS;
    Socket* socketObj = NULL;

    if (PAL_NET_DEFAULT_INTERFACE == interfaceNum)
    {
        interfaceNum = 0;
    }

    if ((s_pal_numberOFInterfaces > interfaceNum) && (PAL_SOCK_DGRAM == type) && ((PAL_AF_INET == domain) || (PAL_AF_INET6 == domain) || (PAL_AF_UNSPEC == domain)))
    {
        socketObj = new UDPSocket(s_pal_networkInterfacesSupported[interfaceNum]);
    }
#if PAL_NET_TCP_AND_TLS_SUPPORT // functionality below supported only in case TCP is supported.
    else if ((s_pal_numberOFInterfaces > interfaceNum) && (PAL_SOCK_STREAM == type) && ((PAL_AF_INET == domain) || (PAL_AF_INET6 == domain) || (PAL_AF_UNSPEC == domain)))
    {
        socketObj = new TCPSocket(s_pal_networkInterfacesSupported[interfaceNum]);
    }
    else if ((s_pal_numberOFInterfaces > interfaceNum) && (PAL_SOCK_STREAM_SERVER == type) && ((PAL_AF_INET == domain) || (PAL_AF_INET6 == domain) || (PAL_AF_UNSPEC == domain)))
    {
        // socketObj = new TCPServer(s_pal_networkInterfacesSupported[interfaceNum]);
    }
#endif
    else
    {
        result =  PAL_ERR_INVALID_ARGUMENT;
    }

    if ((PAL_SUCCESS == result ) && (NULL == socketObj))
    {
        result = PAL_ERR_NO_MEMORY;
    }

    if (PAL_SUCCESS == result)
    {
        if (true == nonBlockingSocket)
        {
            socketObj->set_blocking(false);
        }
        else
        {
            socketObj->set_blocking(true);
        }
        *socket = (palSocket_t)socketObj;
    }
    return result; // TODO(nirson01) ADD debug print for error propagation(once debug print infrastructure is finalized)
}


palStatus_t pal_plat_getSocketOptions(palSocket_t socket, palSocketOptionName_t optionName, void* optionValue, palSocketLength_t* optionLength)
{
    int result = PAL_SUCCESS;
    unsigned int length = *optionLength;
    Socket* socketObj = (Socket*)socket;

    int socketOption = translateNSAPItoPALSocketOption(optionName);

    if (PAL_SOCKET_OPTION_ERROR != socketOption)
    {
        result = socketObj->getsockopt(NSAPI_SOCKET, socketOption, optionValue, &length);
        if (result < 0)
        {
            result =  translateErrorToPALError(result);
        }
        else
        {
            *optionLength = length;
        }

    }
    else
    {
        // in MBED socket timeouts are write only via the API - not supported though socket options.
        result = PAL_ERR_SOCKET_OPTION_NOT_SUPPORTED;
    }

    return result;
}


palStatus_t pal_plat_setSocketOptions(palSocket_t socket, int optionName, const void* optionValue, palSocketLength_t optionLength)
{
    int result = PAL_SUCCESS;
    Socket* socketObj = (Socket*)socket;
    int socketOption = PAL_SOCKET_OPTION_ERROR;

    socketOption = translateNSAPItoPALSocketOption(optionName);
    if (PAL_SOCKET_OPTION_ERROR != socketOption)
    {
        result = socketObj->setsockopt(NSAPI_SOCKET, socketOption, optionValue, optionLength);
        if (result < 0)
        {
            result = translateErrorToPALError(result);
        }
    }
    else
    {
        if ((PAL_SO_SNDTIMEO == optionName) || (PAL_SO_RCVTIMEO == optionName)) // timeouts in MBED API are not managed though socket options, bun instead via a different funciton call
        {
            int timeout = *((int*)optionValue);
            socketObj->set_timeout(timeout);
        }
        else
        {
            result = PAL_ERR_SOCKET_OPTION_NOT_SUPPORTED;
        }
    }


    return result;
}



palStatus_t pal_plat_bind(palSocket_t socket, palSocketAddress_t* myAddress, palSocketLength_t addressLength)
{
    int result = PAL_SUCCESS;
    Socket* socketObj = (Socket*)socket;
    SocketAddress internalAddr;

    result = palSockAddrToSocketAddress(myAddress, addressLength, internalAddr);
    if (result == 0)
    {
        result = socketObj->bind(internalAddr);
        if (result < 0)
        {
            result =  translateErrorToPALError(result);
        }
    }

    return result;
}


palStatus_t pal_plat_receiveFrom(palSocket_t socket, void* buffer, size_t length, palSocketAddress_t* from, palSocketLength_t* fromLength, size_t* bytesReceived)
{
    int result = PAL_SUCCESS;
    int status = 0;
    *bytesReceived = 0;
    SocketAddress sockAddr;
    UDPSocket* socketObj;

    socketObj = (UDPSocket*)socket;

    status = socketObj->recvfrom(&sockAddr, buffer, length);
    if (status < 0)
    {
        result = translateErrorToPALError(status);
    }
    else if (status == 0){
        result = PAL_ERR_SOCKET_CONNECTION_CLOSED;
    }
    else // only return address / bytesReceived in case of success
    {
        if ((NULL != from) && (NULL != fromLength))
        {
            result = socketAddressToPalSockAddr(sockAddr, from, fromLength);

        }
        *bytesReceived = status;
    }

    return result;

}

palStatus_t pal_plat_sendTo(palSocket_t socket, const void* buffer, size_t length, const palSocketAddress_t* to, palSocketLength_t toLength, size_t* bytesSent)
{
    int result = PAL_SUCCESS;
    int status = 0;
    SocketAddress sockAddr;

    UDPSocket* socketObj = (UDPSocket*)socket;

    *bytesSent = 0;
    result = palSockAddrToSocketAddress(to, toLength, sockAddr);
    if (result == 0)
    {
        status = socketObj->sendto(sockAddr, buffer, length);
        if (status < 0)
        {
            result = translateErrorToPALError(status);
        }
        else
        {
            *bytesSent = status;
        }
    }

    return result;
}

palStatus_t pal_plat_close(palSocket_t* socket)
{
    int result = PAL_SUCCESS;
    Socket* socketObj = (Socket*)*socket;
    result = socketObj->close();
    if (result < 0)
    {
        result =  translateErrorToPALError(result);
    }
    delete socketObj;
    *socket = NULL;
    return result;
}

palStatus_t pal_plat_getNumberOfNetInterfaces( uint32_t* numInterfaces)
{
    *numInterfaces =  s_pal_numberOFInterfaces;
    return PAL_SUCCESS;
}

palStatus_t pal_plat_getNetInterfaceInfo(uint32_t interfaceNum, palNetInterfaceInfo_t * interfaceInfo)
{
    palStatus_t result = PAL_SUCCESS;
    const char* address = NULL;
    SocketAddress addr;
    if ((interfaceNum >= s_pal_numberOFInterfaces) || (NULL == interfaceInfo))
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }
    address = s_pal_networkInterfacesSupported[interfaceNum]->get_ip_address(); // ip address returned is a null terminated string
    if (NULL != address)
    {
        addr.set_ip_address(address);
        result = socketAddressToPalSockAddr(addr, &interfaceInfo->address, &interfaceInfo->addressSize);
    }


    return result;
}

typedef void(*palSelectCallbackFunction_t)();

static palSemaphoreID_t s_palSelectSemaphore = 0;
static bool s_palSelectSemaphoreInited = false;
uint32_t s_select_event_happened[PAL_NET_SOCKET_SELECT_MAX_SOCKETS];

// select callbacks definition
// TODO: nirson01 change to define these using a macro.
void palSelectCallback0()
{
    s_select_event_happened[0]++;
    pal_osSemaphoreRelease(s_palSelectSemaphore);
}
void palSelectCallback1()
{
    s_select_event_happened[1]++;
    pal_osSemaphoreRelease(s_palSelectSemaphore);
}
void palSelectCallback2()
{
    s_select_event_happened[2]++;
    pal_osSemaphoreRelease(s_palSelectSemaphore);
}
void palSelectCallback3()
{
    s_select_event_happened[3]++;
    pal_osSemaphoreRelease(s_palSelectSemaphore);
}
void palSelectCallback4()
{
    s_select_event_happened[4]++;
    pal_osSemaphoreRelease(s_palSelectSemaphore);
}
void palSelectCallback5()
{
    s_select_event_happened[5]++;
    pal_osSemaphoreRelease(s_palSelectSemaphore);
}
void palSelectCallback6()
{
    s_select_event_happened[6]++;
    pal_osSemaphoreRelease(s_palSelectSemaphore);
}
void palSelectCallback7()
{
    s_select_event_happened[7]++;
    pal_osSemaphoreRelease(s_palSelectSemaphore);
}

palSelectCallbackFunction_t s_palSelectPalCallbackFunctions[PAL_NET_SOCKET_SELECT_MAX_SOCKETS] = { palSelectCallback0, palSelectCallback1, palSelectCallback2, palSelectCallback3, palSelectCallback4, palSelectCallback5, palSelectCallback6, palSelectCallback7 };


palStatus_t pal_plat_socketMiniSelect(const palSocket_t socketsToCheck[PAL_NET_SOCKET_SELECT_MAX_SOCKETS], uint32_t numberOfSockets, pal_timeVal_t* timeout,
    uint8_t palSocketStatus[PAL_NET_SOCKET_SELECT_MAX_SOCKETS], uint32_t * numberOfSocketsSet)
{
        uint32_t index = 0;
        int32_t counter = 0;
        uint32_t timeoutInMiliseconds = 0;
        palStatus_t result = PAL_SUCCESS;

        if ((NULL == socketsToCheck) || (NULL == numberOfSocketsSet) || (NULL == timeout))
         {
             return PAL_ERR_INVALID_ARGUMENT;
         }

         timeoutInMiliseconds = (timeout->pal_tv_sec * 1000) + (timeout->pal_tv_usec /1000);
         *numberOfSocketsSet = 0;

         if (0 == numberOfSockets)
         {
             return PAL_SUCCESS;
         }
         // create semaphore if not initialized before - if it exists ensure count is 0.

         if (false == s_palSelectSemaphoreInited)
         {
             result = pal_osSemaphoreCreate(0, &s_palSelectSemaphore); // create semaphore to wait until socket event happens (semaphore will be re-used and is only created once, and never freed - if terminate is added free this resoruce if allocaed)
             if (PAL_SUCCESS != result)
             {
                 return result; //single exit ??
             }
             s_palSelectSemaphoreInited = true;
         }
         else {
             int32_t counters = 0;
             result = pal_osSemaphoreWait(s_palSelectSemaphore, 1, &counters); // deplete semaphore count until it is 0.
             while (result != PAL_ERR_RTOS_TIMEOUT)
             {
                 result = pal_osSemaphoreWait(s_palSelectSemaphore, 1, &counters);
             }
             if (PAL_ERR_RTOS_TIMEOUT != result ) // make sure count is actually 0
             {
                 return result; //single exit ??
             }

         }
         for (uint32_t index = 0; index < numberOfSockets; index++)
         {
             s_select_event_happened[index] = 0;
             palSocketStatus[index] = 0;
         }

         for (index = 0; index < numberOfSockets; index++)
         {
             Socket* socketObj = (Socket*)socketsToCheck[index];
             socketObj->attach(s_palSelectPalCallbackFunctions[index]);
         }

         result = pal_osSemaphoreWait(s_palSelectSemaphore, timeoutInMiliseconds, &counter);
         if (result == PAL_SUCCESS)
         {
             for (index = 0; index < numberOfSockets; index++)
             {
                 if (s_select_event_happened[index] > 0)
                 {
                     palSocketStatus[index] |= PAL_NET_SOCKET_SELECT_RX_BIT | PAL_NET_SOCKET_SELECT_TX_BIT | PAL_NET_SOCKET_SELECT_ERR_BIT;
                     *numberOfSocketsSet = *numberOfSocketsSet +1;
                 }
             }
         }
         if (result == PAL_ERR_RTOS_TIMEOUT) // to socket callback has been called to free the semaphore -> no socket events happenet untill the timout.
         {
             *numberOfSocketsSet = 0; // TODO: add debug prints
             result = PAL_SUCCESS; // timeout is not actually an error in this case
         }

         for (index = 0; index < numberOfSockets; index++)
         {

             Socket* socketObj = (Socket*)socketsToCheck[index];
             socketObj->attach(NULL_FUNCTION);
         }
         return result ;
}

#if PAL_NET_TCP_AND_TLS_SUPPORT // functionality below supported only in case TCP is supported.


palStatus_t pal_plat_listen(palSocket_t socket, int backlog)
{
    int result = PAL_SUCCESS;

    // TCPServer* socketObj = (TCPServer*)socket;


    // result = socketObj->listen(backlog);
    // if (result < 0)
    // {
    //     return translateErrorToPALError(result);
    // }
    return PAL_SUCCESS;
}


palStatus_t pal_plat_accept(palSocket_t socket, palSocketAddress_t * address, palSocketLength_t* addressLen, palSocket_t* acceptedSocket)
{
    int result = PAL_SUCCESS;

    SocketAddress incomingAddr;

    // TCPServer* socketObj = (TCPServer*)socket;
    // result = socketObj->accept((TCPSocket*)(*acceptedSocket), &incomingAddr);
    // if (result < 0)
    // {
    //     result = translateErrorToPALError(result);
    // }
    // else
    // {
    //     result = socketAddressToPalSockAddr(incomingAddr, address, addressLen);
    // }
    return result;
}


palStatus_t pal_plat_connect(palSocket_t socket, const palSocketAddress_t* address, palSocketLength_t addressLen)
{
    int result = PAL_SUCCESS;
    SocketAddress internalAddr;
    TCPSocket* socketObj = (TCPSocket*)socket;

    result = palSockAddrToSocketAddress(address, addressLen,  internalAddr);
    if (result == PAL_SUCCESS)
    {
        result = socketObj->connect(internalAddr);
        if (result < 0)
        {
            result =  translateErrorToPALError(result);
        }
    }

    return result;
}

palStatus_t pal_plat_recv(palSocket_t socket, void *buf, size_t len, size_t* recievedDataSize)
{
    int result = PAL_SUCCESS;
    int status = 0;

    TCPSocket* socketObj = (TCPSocket*)socket;


    status = socketObj->recv(buf, len);
    if (status < 0)
    {
        result = translateErrorToPALError(status);
    }
    else if (status == 0){
        return PAL_ERR_SOCKET_CONNECTION_CLOSED;
    }
    *recievedDataSize = status;
    return result;
}

palStatus_t pal_plat_send(palSocket_t socket, const void *buf, size_t len, size_t* sentDataSize)
{
    palStatus_t result = PAL_SUCCESS;
    int status = 0;

    TCPSocket* socketObj = (TCPSocket*)socket;

    status = socketObj->send(buf, len);
    if (status < 0)
    {
        result = translateErrorToPALError(status);
    }
    else
    {
        *sentDataSize = status;
    }
    return result;
}

#endif //PAL_NET_TCP_AND_TLS_SUPPORT


#if PAL_NET_ASYNCHRONOUS_SOCKET_API


palStatus_t pal_plat_asynchronousSocket(palSocketDomain_t domain, palSocketType_t type, bool nonBlockingSocket, uint32_t interfaceNum, palAsyncSocketCallback_t callback, palSocket_t* socket)
{
    Socket* socketObj = NULL;
    palStatus_t result = pal_plat_socket(domain,  type,  nonBlockingSocket,  interfaceNum, socket);
    if (result == PAL_SUCCESS)
    {
        socketObj = (Socket*)*socket;
        socketObj->attach(callback);
    }

    return result;

}

#endif

#if PAL_NET_DNS_SUPPORT

palStatus_t pal_plat_getAddressInfo(const char *url, palSocketAddress_t *address, palSocketLength_t* length)
{
    palStatus_t result = PAL_SUCCESS;

    SocketAddress translatedAddress; // by default use the fist supported net interface - TODO: do we need to select a different interface?
    result = s_pal_networkInterfacesSupported[0]->gethostbyname(url, &translatedAddress);
    if (result == 0)
    {
        result = socketAddressToPalSockAddr(translatedAddress, address, length);
    }
    else // error happened
    {
        result = translateErrorToPALError(result);
    }
    return result;
}

#endif






