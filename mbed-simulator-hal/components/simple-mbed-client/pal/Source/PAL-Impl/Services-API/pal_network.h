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


#ifndef _PAL_SOCKET_H
#define _PAL_SOCKET_H

#ifdef __cplusplus
extern "C" {
#endif

#include "pal.h"
//! PAL network socket API
//! pal network sockets configurations options:
//! set PAL_NET_TCP_AND_TLS_SUPPORT to true TCP is supported by the platform and is required
//! set PAL_NET_ASYNCHRONOUS_SOCKET_API to true if asynchronous socket API supported by the platform and is required : CURRENTLY MANDATORY
//! set PAL_NET_DNS_SUPPORT to true if you DNS url lookup API is supported.

typedef uint32_t palSocketLength_t; /*! length of data */
typedef void* palSocket_t; /*! PAL socket handle type */

#define  PAL_NET_MAX_ADDR_SIZE 32 // check if we can make this more efficient

typedef struct palSocketAddress {
    unsigned short    addressType;    /*! address family for the socket*/
    char              addressData[PAL_NET_MAX_ADDR_SIZE];  /*! address (based on protocol)*/
} palSocketAddress_t; /*! address data structure with enough room to support IPV4 and IPV6*/

typedef struct palNetInterfaceInfo{
    char interfaceName[16]; //15 + ‘\0’
    palSocketAddress_t address;
    uint32_t addressSize;
} palNetInterfaceInfo_t;

typedef enum {
    PAL_AF_UNSPEC = 0,
    PAL_AF_INET = 2,    /*! Internet IP Protocol    */
    PAL_AF_INET6 = 10, /*! IP version 6     */
} palSocketDomain_t;/*! network domains supported by PAL*/

typedef enum {
#if PAL_NET_TCP_AND_TLS_SUPPORT
    PAL_SOCK_STREAM = 1,    /*! stream socket   */
    PAL_SOCK_STREAM_SERVER = 99,    /*! stream socket   */
#endif //PAL_NET_TCP_AND_TLS_SUPPORT
    PAL_SOCK_DGRAM = 2  /*! datagram socket     */
} palSocketType_t;/*! socket types supported by PAL */


typedef enum {
    PAL_SO_REUSEADDR = 0x0004,  /*! allow local address reuse */
#if PAL_NET_TCP_AND_TLS_SUPPORT // socket options below supported only if TCP is supported.
    PAL_SO_KEEPALIVE = 0x0008, /*! keep TCP connection open even if idle using periodic messages*/
#endif //PAL_NET_TCP_AND_TLS_SUPPORT
    PAL_SO_SNDTIMEO = 0x1005,  /*! send timeout */
    PAL_SO_RCVTIMEO = 0x1006,  /*! receive timeout */
} palSocketOptionName_t;/*! socket options supported by PAL */

#define PAL_NET_DEFAULT_INTERFACE 0xFFFFFFFF

#define PAL_IPV4_ADDRESS_SIZE 4
#define PAL_IPV6_ADDRESS_SIZE 16

typedef uint8_t palIpV4Addr_t[PAL_IPV4_ADDRESS_SIZE];
typedef uint8_t palIpV6Addr_t[PAL_IPV6_ADDRESS_SIZE];

typedef struct pal_timeVal{
    int32_t    pal_tv_sec;      /*! seconds */
    int32_t    pal_tv_usec;     /*! microseconds */
} pal_timeVal_t;


/*! Register a network interface for use with PAL sockets - must be called before other socket functions - most APIs will not work before a single interface is added.
* @param[in] networkInterfaceContext of the network  interface to be added (OS specific , e.g. in MbedOS this is the NetworkInterface object pointer for the network adapter [note: we assume connect has already been called on this]) - if not available use NULL .
* @param[out] InterfaceIndex will contain the index assigned to the interface in case it has been assigned successfully. this index can be used when creating a socket to bind the socket to the interface.
\return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_registerNetworkInterface(void* networkInterfaceContext, uint32_t* interfaceIndex);

/*! set a port to a palSocketAddress_t
* setting it can be done either directly or via the  palSetSockAddrIPV4Addr or  palSetSockAddrIPV6Addr functions
* @param[in,out] address the address to set
* @param[in] port the port number to set
\return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
\note for the socket to be set correctly the addressType field of the address must be set correctly. 
*/
palStatus_t pal_setSockAddrPort(palSocketAddress_t* address, uint16_t port);

/*! set an ipV4 address to a palSocketAddress_t and also set the addressType to ipv4
* @param[in,out] address the address to set
* @param[in] ipV4Addr the address value to set
\return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_setSockAddrIPV4Addr(palSocketAddress_t* address, palIpV4Addr_t ipV4Addr);

/*! set an ipV6 address to a palSocketAddress_t and also set the addressType to ipv6
* @param[in,out] address the address to set
* @param[in] ipV6Addr the address value to set
\return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_setSockAddrIPV6Addr(palSocketAddress_t* address, palIpV6Addr_t ipV6Addr);

/*! get an ipV4 address from a palSocketAddress_t
* @param[in] address the address to set
* @param[out] ipV4Addr the address that is set in the address
\return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_getSockAddrIPV4Addr(const palSocketAddress_t* address, palIpV4Addr_t ipV4Addr);

/*! get an ipV6 address from a palSocketAddress_t
* @param[in] address the address to set
* @param[out] ipV6Addr the address that is set in the address
\return the function returns the status in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_getSockAddrIPV6Addr(const palSocketAddress_t* address, palIpV6Addr_t ipV6Addr);

/*! get a port from a palSocketAddress_t
* @param[in] address the address to set
* @param[out] port the port that is set in the address
\return the function returns the status in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_getSockAddrPort(const palSocketAddress_t* address, uint16_t* port);

/*! get a network socket
* @param[in] domain the domain for the created socket (see palSocketDomain_t for supported types)
* @param[in] type the type for the created socket (see palSocketType_t for supported types)
* @param[in] nonBlockingSocket if true the socket created is created as non-blocking (i.e. with O_NONBLOCK set)
* @param[in] interfaceNum the number of the network interface used for this socket (info in interfaces supported via pal_getNumberOfNetInterfaces and pal_getNetInterfaceInfo ), choose PAL_NET_DEFAULT_INTERFACE for default interface.
* @param[out] socket socket is returned through this output parameter
\return the function returns the status in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_socket(palSocketDomain_t domain, palSocketType_t type, bool nonBlockingSocket, uint32_t interfaceNum, palSocket_t* socket);

/*! get options for a given network socket
* @param[in] socket the socket for which to get options
* @param[in] optionName for which we are setting the option (see enum PAL_NET_SOCKET_OPTION for supported types)
* @param[out] optionValue the buffer holding the option value returned by the function
* @param[in, out] optionLength the size of the buffer provided for optionValue when calling the function after the call it will contain the length of data actually written to the optionValue buffer.
\return the function returns the status in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_getSocketOptions(palSocket_t socket, palSocketOptionName_t optionName, void* optionValue, palSocketLength_t* optionLength);

/*! set options for a given network socket
* @param[in] socket the socket for which to get options
* @param[in] optionName for which we are setting the option (see enum PAL_NET_SOCKET_OPTION for supported types)
* @param[in] optionValue the buffer holding the option value to set for the given option
* @param[in] optionLength  the size of the buffer provided for optionValue
\return the function returns the status in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_setSocketOptions(palSocket_t socket, int optionName, const void* optionValue, palSocketLength_t optionLength);

/*! bind a given socket to a local address
* @param[in] socket the socket to bind
* @param[in] myAddress the address to which to bind
* @param[in] addressLength the length of the address passed in myAddress
\return the function returns the status in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_bind(palSocket_t socket, palSocketAddress_t* myAddress, palSocketLength_t addressLength);

/*! receive a payload from the given socket
* @param[in] socket the socket to receive from [we expect sockets passed to this function to be of type PAL_SOCK_DGRAM  ( the implementation may support other types as well) ]
* @param[out] buffer the buffer for the payload data
* @param[in] length of the buffer for the payload data
* @param[out] from the address which sent the payload
* @param[in, out] fromLength the length of the 'from' address, after completion will contain the amount of data actually written to the from address
* @param[out] bytesReceived after the call will contain the actual amount of payload data received to the buffer
\return the function returns the status in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_receiveFrom(palSocket_t socket, void* buffer, size_t length, palSocketAddress_t* from, palSocketLength_t* fromLength, size_t* bytesReceived);

/*! send a payload to the given address using the given socket
* @param[in] socket the socket to use for sending the payload [we expect sockets passed to this function to be of type PAL_SOCK_DGRAM  ( the implementation may support other types as well) ]
* @param[in] buffer the buffer for the payload data
* @param[in] length of the buffer for the payload data
* @param[in] to the address to which to payload should be sent
* @param[in] toLength the length of the 'to' address
* @param[out] bytesSent after the call will contain the actual amount of payload data sent
\return the function returns the status in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_sendTo(palSocket_t socket, const void* buffer, size_t length, const palSocketAddress_t* to, palSocketLength_t toLength, size_t* bytesSent);

/*! close a network socket
* @param[in,out] socket release and zero socket pointed to by given pointer.
\return the function returns the status as in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
\note recieves palSocket_t* and not palSocket_t so that it can zero the socket to avoid re-use.
*/
palStatus_t pal_close(palSocket_t* socket);

/*! get the number of current network interfaces
* @param[out] numInterfaces will hold the number of interfaces after a successful call
\return the function returns the status as in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_getNumberOfNetInterfaces(uint32_t* numInterfaces);

/*! get information regarding the socket at the index/interface number given (this number is returned when registering the socket)
* @param[in] interfaceNum the number of the interface to get information for.
* @param[out] interfaceInfo will be set to the information for the given interface number.
\return the function returns the status as in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_getNetInterfaceInfo(uint32_t interfaceNum, palNetInterfaceInfo_t* interfaceInfo);


#define PAL_NET_SOCKET_SELECT_MAX_SOCKETS 8
#define PAL_NET_SOCKET_SELECT_RX_BIT (1)
#define PAL_NET_SOCKET_SELECT_TX_BIT (2)
#define PAL_NET_SOCKET_SELECT_ERR_BIT (4)

#define PAL_NET_SELECT_IS_RX(socketStatus, index)   ((socketStatus[index] | PAL_NET_SOCKET_SELECT_RX_BIT) != 0) /*! check if RX bit is set in select result for a given socket index*/
#define PAL_NET_SELECT_IS_TX(socketStatus, index)   ((socketStatus[index] | PAL_NET_SOCKET_SELECT_TX_BIT) != 0) /*! check if TX bit is set in select result for a given socket index*/
#define PAL_NET_SELECT_IS_ERR(socketStatus, index)  ((socketStatus[index] | PAL_NET_SOCKET_SELECT_ERR_BIT) != 0) /*! check if ERR bit is set in select result for a given socket index*/

/*! check if one or more (up to PAL_NET_SOCKET_SELECT_MAX_SOCKETS) sockets given has data available for reading/writing/error, the function will block until data is available for one of the given sockets or the timeout expires.
To use the function: set the sockets you want to check in the socketsToCheck array and set a timeout, when it returns the socketStatus output will indicate the status of each socket passed in.
* @param[in] socketsToCheck on input: the array of up to 8 sockets handles to check.
* @param[in] numberOfSockets the number of sockets set in the input socketsToCheck array.
* @param[in] timeout the amount of time till timeout if no socket activity is detected
* @param[out] socketStatus will provide information on each socket in the input array indicating which event was set (none, rx, tx, err) check for desired event using macros.
* @param[out] numberOfSocketsSet is the total number of sockets set in all three data sets (tx, rx, err)after the function completes
\return the function returns the status in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
\note the entry in index x in the socketStatus array corresponds to the socket at index x in the sockets to check array.
*/
palStatus_t pal_socketMiniSelect(const palSocket_t socketsToCheck[PAL_NET_SOCKET_SELECT_MAX_SOCKETS], uint32_t numberOfSockets, pal_timeVal_t* timeout,
                                uint8_t palSocketStatus[PAL_NET_SOCKET_SELECT_MAX_SOCKETS], uint32_t* numberOfSocketsSet);


#if PAL_NET_TCP_AND_TLS_SUPPORT // functionality below supported only in case TCP is supported.


/*! use given socket to listed for incoming connections, may also limit queue of incoming connections.
* @param[in] socket the socket to listen on [we expect sockets passed to this function to be of type PAL_SOCK_STREAM_SERVER  ( the implementation may support other types as well) ]
* @param[in] backlog the amount connections of pending connections which can be saved for the socket
\return the function returns the status as in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_listen(palSocket_t socket, int backlog);

/*! accept a connection on the given socket
* @param[in] socket the socket on which to accept the connection (prerequisite: socket already created and bind and listen have been called on it ) [we expect sockets passed to this function to be of type PAL_SOCK_STREAM_SERVER  ( the implementation may support other types as well) ]
* @param[out] address the source address of the incoming connection
* @param[in, out] addressLen the length of the address field on input, the length of the data returned on output.
* @param[out] acceptedSocket the socket of the accepted connection will be returned here if connection accepted successfully.

\return the function returns the status as in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_accept(palSocket_t socket, palSocketAddress_t* address, palSocketLength_t* addressLen, palSocket_t* acceptedSocket);

/*! open a connection from the given socket to the given address
* @param[in] socket the socket to use for connection to the given address [we expect sockets passed to this function to be of type PAL_SOCK_STREAM ( the implementation may support other types as well) ]
* @param[in] address the destination address of the connection
* @param[in] addressLen the length of the address field
\return the function returns the status as in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_connect(palSocket_t socket, const palSocketAddress_t* address, palSocketLength_t addressLen);

/*! receive data from the given connected socket
* @param[in] socket the connected socket on which to receive data [we expect sockets passed to this function to be of type PAL_SOCK_STREAM ( the implementation may support other types as well) ]
* @param[out] buf the output buffer for the message data
* @param[in] len the length of the input data buffer
* @param[out] recievedDataSize the length of the data actually received
\return the function returns the status as in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_recv(palSocket_t socket, void* buf, size_t len, size_t* recievedDataSize);

/*! send a given buffer via the given connected socket
* @param[in] socket the connected socket on which to send data [we expect sockets passed to this function to be of type PAL_SOCK_STREAM ( the implementation may support other types as well) ]
* @param[in] buf the output buffer for the message data
* @param[in] len the length of the input data buffer
* @param[out] sentDataSize the length of the data sent
\return the function returns the status as in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_send(palSocket_t socket, const void* buf, size_t len, size_t* sentDataSize);


#endif //PAL_NET_TCP_AND_TLS_SUPPORT


#if PAL_NET_ASYNCHRONOUS_SOCKET_API

/*! callback function called when an even happens an asynchronous socket for which it was set using the pal_asynchronousSocket. 
*/
typedef void(*palAsyncSocketCallback_t)();

/*! get an asynchronous network socket
* @param[in] domain the domain for the created socket (see enum palSocketDomain_t for supported types)
* @param[in] type the type for the created socket (see enum palSocketType_t for supported types)
* @param[in] nonBlockingSocket if true the socket created is created as non-blocking (i.e. with O_NONBLOCK set)
* @param[in] interfaceNum the number of the network interface used for this socket (info in interfaces supported via pal_getNumberOfNetInterfaces and pal_getNetInterfaceInfo ), choose PAL_NET_DEFAULT_INTERFACE for default interface.
* @param[in] callback a callback function that will be called when any supported event happens to the given asynchronous socket (see palAsyncSocketCallbackType enum for the types of events supported)
* @param[out] socket socket is returned through this output parameter
\return the function returns the status in the form of PalStatus_t which will be PAL_SUCCESS (0) in case of success or a specific negative error code in case of failure
*/
palStatus_t pal_asynchronousSocket(palSocketDomain_t domain, palSocketType_t type, bool nonBlockingSocket, uint32_t interfaceNum, palAsyncSocketCallback_t callback, palSocket_t* socket);

#endif

#if PAL_NET_DNS_SUPPORT

/*! this function will translate from a URL to a palSocketAddress_t which can be used with pal sockets. It supports both IP address as strings and URLs (using DNS lookup).
* @param[in] url the URL (or IP address sting) to be translated into a palSocketAddress_t.
* @param[out] address the address for the output of the translation.
*/
palStatus_t pal_getAddressInfo(const char* url, palSocketAddress_t* address, palSocketLength_t* addressLength);

#endif

#ifdef __cplusplus
}
#endif
#endif //_PAL_SOCKET_H


