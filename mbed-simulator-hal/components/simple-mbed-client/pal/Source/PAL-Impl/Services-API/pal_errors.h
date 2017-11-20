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


#ifndef _PAL_ERRORS_H
#define _PAL_ERRORS_H

#ifdef __cplusplus
extern "C" {
#endif

#include "pal_types.h"


typedef enum {
    PAL_ERR_MODULE_GENERAL      = 0x4,
    PAL_ERR_MODULE_PAL          = 0x6,
    PAL_ERR_MODULE_C            = 0x8,
    PAL_ERR_MODULE_RTOS         = 0xC,
    PAL_ERR_MODULE_NET          = 0x10,
    PAL_ERR_MODULE_TLS          = 0x14,
    PAL_ERR_MODULE_CRYPTO       = 0x18,
    PAL_ERR_MODULE_UPDATE       = 0x1C,
} palErrorModules_t;


typedef enum {
    // generic errors
    PAL_ERR_GENERAL_BASE =          (-1 << PAL_ERR_MODULE_GENERAL),
    PAL_ERR_GENERIC_FAILURE =       PAL_ERR_GENERAL_BASE,           /*! generic failure*/ // try to use a more specific error message whenever possible
    PAL_ERR_INVALID_ARGUMENT =      PAL_ERR_GENERAL_BASE + 1,   /*! one or more of the functions arguments is invalid */
    PAL_ERR_NO_MEMORY =             PAL_ERR_GENERAL_BASE + 2,   /*! failure due to a failed attempt to allocate memory */
    PAL_ERR_BUFFER_TOO_SMALL =      PAL_ERR_GENERAL_BASE + 3,   /*! buffer given is too small*/
    PAL_ERR_NOT_SUPPORTED =         PAL_ERR_GENERAL_BASE + 4,   /*! operation not supported by PAL for the current configuration*/
    PAL_ERR_TIMEOUT_EXPIRED =       PAL_ERR_GENERAL_BASE + 5,   /*! timeout for the operation has expired */
    PAL_ERR_NOT_INITIALIZED =       PAL_ERR_GENERAL_BASE + 6,   /*! timeout for the operation has expired */
    PAL_ERR_NULL_POINTER     =      PAL_ERR_GENERAL_BASE + 7,   /*! received a null pointer when it should be initialized */
    PAL_ERR_CREATION_FAILED =       PAL_ERR_GENERAL_BASE + 8,   /*! failure in creation of given type, like: mutex, thread , etc */
    // pal errors
    PAL_ERR_NOT_IMPLEMENTED =                               (-1 << PAL_ERR_MODULE_PAL), /*!Currently not implemented will be in the future*/
    // c errors
    // RTOS errors
    PAL_ERR_RTOS_ERROR_BASE =                               (-1 << PAL_ERR_MODULE_RTOS),    /*! generic failure in RTOS module*/ // try to use a more specific error message whenever possible
    PAL_ERR_RTOS_PARAMETER =                                PAL_ERR_RTOS_ERROR_BASE + 0x80,/*! PAL mapping of CMSIS error osErrorParameter : parameter error: a mandatory parameter was missing or specified an incorrect object.*/
    PAL_ERR_RTOS_RESOURCE =                                 PAL_ERR_RTOS_ERROR_BASE + 0x81,/*! PAL mapping of CMSIS error osErrorResource : resource not available: a specified resource was not available.*/
    PAL_ERR_RTOS_TIMEOUT =                                  PAL_ERR_RTOS_ERROR_BASE + 0xC1,/*! PAL mapping of CMSIS error osErrorTimeoutResource : resource not available within given time: a specified resource was not available within the timeout period*/
    PAL_ERR_RTOS_ISR =                                      PAL_ERR_RTOS_ERROR_BASE + 0x82,/*! PAL mapping of CMSIS error osErrorISR : not allowed in ISR context: the function cannot be called from interrupt service routines.*/
    PAL_ERR_RTOS_ISR_RECURSIVE =                            PAL_ERR_RTOS_ERROR_BASE + 0x83,/*! PAL mapping of CMSIS error osErrorISRRecursive : function called multiple times from ISR with same object.c*/
    PAL_ERR_RTOS_PRIORITY =                                 PAL_ERR_RTOS_ERROR_BASE + 0x84,/*! PAL mapping of CMSIS error osErrorPriority : system cannot determine priority or thread has illegal priority.*/
    PAL_ERR_RTOS_NO_MEMORY =                                PAL_ERR_RTOS_ERROR_BASE + 0x85,/*! PAL mapping of CMSIS error osErrorNoMemory : system is out of memory: it was impossible to allocate or reserve memory for the operation.*/
    PAL_ERR_RTOS_VALUE =                                    PAL_ERR_RTOS_ERROR_BASE + 0x86,/*! PAL mapping of CMSIS error osErrorValue :  value of a parameter is out of range.*/
    PAL_ERR_RTOS_OS =                                       PAL_ERR_RTOS_ERROR_BASE + 0xFF,/*! PAL mapping of CMSIS error osErrorOS : unspecified RTOS error: run-time error but no other error message fits.*/
    // network errors
    PAL_ERR_SOCKET_ERROR_BASE =                             (-1 << PAL_ERR_MODULE_NET),             /*! generic socket error */
    PAL_ERR_SOCKET_GENERIC =                                PAL_ERR_SOCKET_ERROR_BASE,              /*! generic socket error */
    PAL_ERR_SOCKET_NO_BUFFERS =                             PAL_ERR_SOCKET_ERROR_BASE + 1,          /*! no buffers -  PAL mapping of posix error ENOBUFS*/ 
    PAL_ERR_SOCKET_HOST_UNREACHABLE =                       PAL_ERR_SOCKET_ERROR_BASE + 2,          /*! host unreachable (routing error)-  PAL mapping of posix error EHOSTUNREACH*/
    PAL_ERR_SOCKET_IN_PROGRES =                             PAL_ERR_SOCKET_ERROR_BASE + 3,          /*! in progress-   PAL mapping of posix error EINPROGRESS*/
    PAL_ERR_SOCKET_INVALID_VALUE =                          PAL_ERR_SOCKET_ERROR_BASE + 4,          /*!invalid value -  PAL mapping of posix error EINVAL*/
    PAL_ERR_SOCKET_WOULD_BLOCK =                            PAL_ERR_SOCKET_ERROR_BASE + 5,          /*! would block -   PAL mapping of posix error EWOULDBLOCK*/
    PAL_ERR_SOCKET_ADDRESS_IN_USE =                         PAL_ERR_SOCKET_ERROR_BASE + 6,          /*! Address in use - PAL mapping of posix error EADDRINUSE*/
    PAL_ERR_SOCKET_ALREADY_CONNECTED =                      PAL_ERR_SOCKET_ERROR_BASE + 7,          /*! Already connected - PAL mapping of posix error EALREADY*/
    PAL_ERR_SOCKET_CONNECTION_ABORTED =                     PAL_ERR_SOCKET_ERROR_BASE + 8,          /*! Connection aborted - PAL mapping of posix error ECONNABORTED*/
    PAL_ERR_SOCKET_CONNECTION_RESET =                       PAL_ERR_SOCKET_ERROR_BASE + 9,          /*! Connection reset - PAL mapping of posix error ECONNRESET*/
    PAL_ERR_SOCKET_NOT_CONNECTED =                          PAL_ERR_SOCKET_ERROR_BASE + 10,         /*! Not connected -  PAL mapping of posix error ENOTCONN*/
    PAL_ERR_SOCKET_INPUT_OUTPUT_ERROR =                     PAL_ERR_SOCKET_ERROR_BASE + 11,         /*! I/O error  PAL mapping of posix error EIO*/
    PAL_ERR_SOCKET_CONNECTION_CLOSED =                      PAL_ERR_SOCKET_ERROR_BASE + 12,         /*! connection closed */
    PAL_ERR_SOCKET_FAILED_TO_SET_SOCKET_TO_NON_BLOCKING =   PAL_ERR_SOCKET_ERROR_BASE + 13,         /*! failed to set socket to non-blocking */
    PAL_ERR_SOCKET_INVALID_ADDRESS_FAMILY =                 PAL_ERR_SOCKET_ERROR_BASE + 14,         /*! failed to set socket to non-blocking */
    PAL_ERR_SOCKET_INVALID_ADDRESS =                        PAL_ERR_SOCKET_ERROR_BASE + 15,         /*! address given was not valid/found*/
    PAL_ERR_SOCKET_DNS_ERROR =                              PAL_ERR_SOCKET_ERROR_BASE + 16,         /*! DNS lookup error*/
    PAL_ERR_SOCKET_HDCP_ERROR =                             PAL_ERR_SOCKET_ERROR_BASE + 17,         /*! HDCP error*/
    PAL_ERR_SOCKET_AUTH_ERROR =                             PAL_ERR_SOCKET_ERROR_BASE + 18,         /*! authentication error*/
    PAL_ERR_SOCKET_OPTION_NOT_SUPPORTED =                   PAL_ERR_SOCKET_ERROR_BASE + 19,         /*! socket option not supported*/
    //update Error
    PAL_ERR_UPDATE_ERROR_BASE           =                   (-1 << PAL_ERR_MODULE_UPDATE),          /*! generic error */
    PAL_ERR_UPDATE_ERROR                =                   PAL_ERR_UPDATE_ERROR_BASE,              /*! unknown error */
    PAL_ERR_UPDATE_BUSY                 =                   PAL_ERR_UPDATE_ERROR_BASE + 1,          /*! unknown error */
    PAL_ERR_UPDATE_TIMEOUT              =                   PAL_ERR_UPDATE_ERROR_BASE + 2,          /*! unknown error */
    PAL_ERR_UPDATE_OUT_OF_BOUNDS        =                   PAL_ERR_UPDATE_ERROR_BASE + 3,          /*! unknown error */
    PAL_ERR_UPDATE_PALFROM_API          =                   PAL_ERR_UPDATE_ERROR_BASE + 4,          /*! unknown error */
    PAL_ERR_UPDATE_PALFROM_IO           =                   PAL_ERR_UPDATE_ERROR_BASE + 5,          /*! unknown error */
    PAL_ERR_UPDATE_END_OF_IMAGE         =                   PAL_ERR_UPDATE_ERROR_BASE + 6,          /*! unknown error */
    PAL_ERR_UPDATE_CHUNK_TO_SMALL       =                   PAL_ERR_UPDATE_ERROR_BASE + 7,          /*! unknown error */

} palError_t; /*! errors returned by the pal service API */


#ifdef __cplusplus
}
#endif
#endif //_PAL_ERRORS
