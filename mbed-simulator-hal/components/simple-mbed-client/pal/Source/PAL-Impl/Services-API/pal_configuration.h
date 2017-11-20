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


#ifndef _PAL_COFIGURATION_H
#define _PAL_COFIGURATION_H

#ifdef __cplusplus
extern "C" {
#endif

//! pal configuration options
#define PAL_NET_TCP_AND_TLS_SUPPORT         true/* add pal support for TCP */
#define PAL_NET_ASYNCHRONOUS_SOCKET_API     true/* add pal support for asynchronous sockets */
#define PAL_NET_DNS_SUPPORT                 true/* add pal support for DNS lookup */

#define PAL_RTOS_64BIT_TICK_SUPPORTED       false /* add pal support for asynchronous sockets */
#define PAL_UNIQUE_THREAD_PRIORITY          (!defined(PAL_IGNORE_UNIQUE_THREAD_PRIORITY))/* if defined code skips the uniqueness priority check */

//! number of valid priorities limits the number of threads- if priorities are added this value should be increased
#define PAL_MAX_NUMBER_OF_THREADS 7 

//! the maximal number of interfaces that can be supported at once.
#define PAL_MAX_SUPORTED_NET_INTEFACES 5

#ifdef __GNUC__ // we are compiling using GCC/G++
    #define PAL_TARGET_POINTER_SIZE __SIZEOF_POINTER__
    #ifdef __BYTE_ORDER
        #if __BYTE_ORDER == __BIG_ENDIAN //if both are not defined it is TRUE!
            #define PAL_COMPILATION_ENDIANITY 1 //define pal compilation endianity (0 is little endian, 1 is big endian)
        #elif __BYTE_ORDER == __LITTLE_ENDIAN
            #define PAL_COMPILATION_ENDIANITY 0//define pal compilation endianity (0 is little endian, 1 is big endian)
        #else
            #error missing endiantiy defintion for GCC
        #endif

    #endif
#else
    #ifdef __arm__ // we are compiling using the ARM compiler
        #define PAL_TARGET_POINTER_SIZE __sizeof_ptr
        #ifdef __BIG_ENDIAN
            #define PAL_COMPILATION_ENDIANITY 1 //define pal compilation endianity (0 is little endian, 1 is big endian)
        #else 
            #define PAL_COMPILATION_ENDIANITY 0 //define pal compilation endianity (0 is little endian, 1 is big endian)
        #endif
    #else
        //#error neither ARMCC nor GCC used for compilation - not supported
    #endif
 

#endif

#ifdef __cplusplus
}
#endif
#endif //_PAL_COFIGURATION_H
