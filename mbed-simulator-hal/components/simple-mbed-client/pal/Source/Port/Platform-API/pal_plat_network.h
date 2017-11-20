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


#ifndef _PAL_PLAT_SOCKET_H
#define _PAL_PLAT_SOCKET_H

#include "pal.h"
#include "pal_network.h"

#ifdef __cplusplus
extern "C" {
#endif

//! PAL network socket API
//! PAL network sockets configurations options:
//! define PAL_NET_TCP_AND_TLS_SUPPORT if TCP is supported by the platform and is required.
//! define PAL_NET_ASYNCHRONOUS_SOCKET_API if asynchronous socket API is supported by the platform. Currently MANDATORY.
//! define PAL_NET_DNS_SUPPORT if DNS name resolution is supported.

/*! Initialize sockets - must be called before other socket functions (is called from PAL init).
* @param[in] context Optional context - if not available/applicable use NULL.
\return The status in the form of palStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_socketsInit(void* context);

/*! Register a network interface for use with PAL sockets - must be called before other socket functions - most APIs will not work before a single interface is added.
* @param[in] networkInterfaceContext The context of the network interface to be added (OS specific. In mbed OS, this is the NetworkInterface object pointer for the network adapter [note: we assume connect has already been called on this]). - if not available use NULL (may not be required on some OSs).
* @param[out] interfaceIndex Contains the index assigned to the interface in case it has been assigned successfully. This index can be used when creating a socket to bind the socket to the interface.
\return The status in the form of palStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_RegisterNetworkInterface(void* networkInterfaceContext, uint32_t* interfaceIndex);

/*! Initialize terminate - can be called when sockets are no longer needed to free socket resources allocated by init.
* @param[in] context Optional context - if not available use NULL.
\return The status in the form of palStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_socketsTerminate(void* context);

/*! Get a network socket.
* @param[in] domain The domain of the created socket (see palSocketDomain_t for supported types).
* @param[in] type The type of the created socket (see palSocketType_t for supported types).
* @param[in] nonBlockingSocket If true, the socket is non-blocking (with O_NONBLOCK set).
* @param[in] interfaceNum The number of the network interface used for this socket (info in interfaces supported via pal_getNumberOfNetInterfaces and pal_getNetInterfaceInfo ), choose PAL_NET_DEFAULT_INTERFACE for default interface.
* @param[out] socket The socket is returned through this output parameter.
\return The status in the form of PalStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_socket(palSocketDomain_t domain, palSocketType_t type, bool nonBlockingSocket, uint32_t interfaceNum, palSocket_t* socket);

/*! Get options for a given network socket. Only a few options are supported (see palSocketOptionName_t for supported options).
* @param[in] socket The socket for which to get options.
* @param[in] optionName The name for which to set the option (see enum PAL_NET_SOCKET_OPTION for supported types).
* @param[out] optionValue The buffer holding the option value returned by the function.
* @param[in, out] optionLength The size of the buffer provided for optionValue when calling the function. After the call, it contains the length of data actually written to the optionValue buffer.
\return The status in the form of PalStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_getSocketOptions(palSocket_t socket, palSocketOptionName_t optionName, void* optionValue, palSocketLength_t* optionLength);

/*! Set options for a given network socket. Only a few options are supported (see palSocketOptionName_t for supported options).
* @param[in] socket The socket for which to get options.
* @param[in] optionName The name for which to set the option (see enum PAL_NET_SOCKET_OPTION for supported types).
* @param[in] optionValue The buffer holding the option value to set for the given option.
* @param[in] optionLength The size of the buffer provided for optionValue.
\return The status in the form of PalStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_setSocketOptions(palSocket_t socket, int optionName, const void* optionValue, palSocketLength_t optionLength);

/*! Bind a given socket to a local address.
* @param[in] socket The socket to bind.
* @param[in] myAddress The address to bind to.
* @param[in] addressLength The length of the address passed in myAddress.
\return The status in the form of PalStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_bind(palSocket_t socket, palSocketAddress_t* myAddress, palSocketLength_t addressLength);

/*! Receive a payload from the given socket.
* @param[in] socket The socket to receive from [sockets passed to this function should be of type PAL_SOCK_DGRAM (the implementation may support other types as well)].
* @param[out] buffer The buffer for the payload data.
* @param[in] length The length of the buffer for the payload data.
* @param[out] from The address that sent the payload [optional - if not required pass NULL].
* @param[in, out] fromLength The length of the 'from' address. When completed, this contains the amount of data actually written to the from address [optional - if not required pass NULL].
* @param[out] bytesReceived The actual amount of payload data received to the buffer.
\return The status in the form of PalStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_receiveFrom(palSocket_t socket, void* buffer, size_t length, palSocketAddress_t* from, palSocketLength_t* fromLength, size_t* bytesReceived);

/*! Send a payload to the given address using the given socket.
* @param[in] socket The socket to use for sending the payload [sockets passed to this function should be of type PAL_SOCK_DGRAM (the implementation may support other types as well)].
* @param[in] buffer The buffer for the payload data.
* @param[in] length The length of the buffer for the payload data.
* @param[in] to The address to which the payload should be sent.
* @param[in] toLength The length of the 'to' address.
* @param[out] bytesSent The actual amount of payload data sent.
\return The status in the form of PalStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_sendTo(palSocket_t socket, const void* buffer, size_t length, const palSocketAddress_t* to, palSocketLength_t toLength, size_t* bytesSent);

/*! Close a network socket. 
* NOTE: recieves palSocket_t* and not palSocket_t so that it can zero the socket to avoid re-use.
* @param[in,out] socket Release and zero socket pointed to by given pointer.
\return The status in the form of PalStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_close(palSocket_t* socket);

/*! Get the number of current network interfaces (interfaces that have been registered through).
* @param[out] numInterfaces The number of interfaces after a successful call.
\return The status as in the form of PalStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_getNumberOfNetInterfaces(uint32_t* numInterfaces);

/*! Get information regarding the socket at the index/interface number given (this number is returned when registering the socket).
* @param[in] interfaceNum The number of the interface to get information for.
* @param[out] interfaceInfo The information for the given interface number.
\return The status in the form of PalStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_getNetInterfaceInfo(uint32_t interfaceNum, palNetInterfaceInfo_t* interfaceInfo);


/*! Check if one or more (up to PAL_NET_SOCKET_SELECT_MAX_SOCKETS) sockets has data available for reading/writing/error. The function blocks until data is available for one of the given sockets or the timeout expires.
To use the function, set the sockets you want to check in the socketsToCheck array and set a timeout. When it returns the socketStatus output inidcates the status of each socket passed in.
Note: The entry in index x in the socketStatus array corresponds to the socket at index x in the sockets to check array.
* @param[in] socketsToCheck The array of up to 8 socket handles to check.
* @param[in] numberOfSockets The number of sockets set in the input socketsToCheck array.
* @param[in] timeout The time until timeout if no socket activity is detected.
* @param[out] palSocketStatus Information on each socket in the input array indicating which event was set (none, rx, tx, err). Check for a desired event using macros.
* @param[out] numberOfSocketsSet The total number of sockets set in all three data sets (tx, rx, err) after a completed function.
\return The status in the form of PalStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_socketMiniSelect(const palSocket_t socketsToCheck[PAL_NET_SOCKET_SELECT_MAX_SOCKETS], uint32_t numberOfSockets, pal_timeVal_t* timeout,
                                        uint8_t palSocketStatus[PAL_NET_SOCKET_SELECT_MAX_SOCKETS], uint32_t * numberOfSocketsSet);


#if PAL_NET_TCP_AND_TLS_SUPPORT // functionality below supported only in case TCP is supported.


/*! Use a socket to listen to incoming connections. You may also limit the queue of incoming connections.
* @param[in] socket The socket to listen to [sockets passed to this function should be of type PAL_SOCK_STREAM_SERVER (the implementation may support other types as well)].
* @param[in] backlog The number of pending connections that can be saved for the socket.
\return The status in the form of PalStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_listen(palSocket_t socket, int backlog);

/*! Accept a connection on the given socket.
* @param[in] socket The socket on which to accept the connection. The socket needs to be created and bound and listen must have been called on it. [sockets passed to this function should be of type PAL_SOCK_STREAM_SERVER (the implementation may support other types as well)].
* @param[out] address The source address of the incoming connection.
* @param[in, out] addressLen The length of the address field on input, the length of the data returned on output.
* @param[out] acceptedSocket The socket of the accepted connection is returned if the connection is accepted successfully.
\return The status in the form of PalStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_accept(palSocket_t socket, palSocketAddress_t* address, palSocketLength_t* addressLen, palSocket_t* acceptedSocket);

/*! Open a connection from the given socket to the given address.
* @param[in] socket The socket to use for the connection to the given address [sockets passed to this function should be of type PAL_SOCK_STREAM (the implementation may support other types as well)].
* @param[in] address The destination address of the connection.
* @param[in] addressLen The length of the address field.
\return The status in the form of PalStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_connect(palSocket_t socket, const palSocketAddress_t* address, palSocketLength_t addressLen);

/*! Receive data from the given connected socket.
* @param[in] socket The connected socket on which to receive data [sockets passed to this function should be of type PAL_SOCK_STREAM (the implementation may support other types as well)].
* @param[out] buf The output buffer for the message data.
* @param[in] len The length of the input data buffer.
* @param[out] recievedDataSize The length of the data actually received.
\return The status in the form of PalStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_recv(palSocket_t socket, void* buf, size_t len, size_t* recievedDataSize);

/*! Send a given buffer via the given connected socket.
* @param[in] socket The connected socket on which to send data [sockets passed to this function should be of type PAL_SOCK_STREAM (the implementation may support other types as well)].
* @param[in] buf The output buffer for the message data.
* @param[in] len The length of the input data buffer.
* @param[out] sentDataSize The length of the data sent.
\return The status in the form of PalStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_send(palSocket_t socket, const void* buf, size_t len, size_t* sentDataSize);


#endif //PAL_NET_TCP_AND_TLS_SUPPORT


#if PAL_NET_ASYNCHRONOUS_SOCKET_API

/*! Get an asynchronous network socket.
* @param[in] domain The domain of the created socket (see enum palSocketDomain_t for supported types).
* @param[in] type The type of the created socket (see enum palSocketType_t for supported types).
* @param[in] callback A callback function that is called when any supported event takes place in the given asynchronous socket (see palAsyncSocketCallbackType enum for the supported event types).
* @param[out] socket This output parameter returns the socket.
\return The status in the form of PalStatus_t; PAL_SUCCESS (0) in case of success, a specific negative error code in case of failure.
*/
palStatus_t pal_plat_asynchronousSocket(palSocketDomain_t domain, palSocketType_t type, bool nonBlockingSocket, uint32_t interfaceNum, palAsyncSocketCallback_t callback, palSocket_t* socket);

#endif

#if PAL_NET_DNS_SUPPORT

/*! This function translates the URL to a palSocketAddress_t that can be used with PAL sockets.
* @param[in] url The URL to be translated to a palSocketAddress_t.
* @param[out] address The address for the output of the translation.
*/
palStatus_t pal_plat_getAddressInfo(const char* url, palSocketAddress_t* address, palSocketLength_t* addressLength);

#endif


#ifdef __cplusplus
}
#endif
#endif //_PAL_PLAT_SOCKET_H
