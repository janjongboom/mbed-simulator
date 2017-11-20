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


#ifndef _PAL_MACROS_H
#define _PAL_MACROS_H

#ifdef __cplusplus
extern "C" {
#endif

#include "pal_errors.h"
// PAL success value
#define PAL_SUCCESS 0

// maximum integer types
#define PAL_MAX_UINT8       0xFFU
#define PAL_MAX_UINT16      0xFFFFU
#define PAL_MAX_UINT32      0xFFFFFFFFUL
#define PAL_MAX_INT32       0x7FFFFFFFL
#define PAL_MIN_INT32       0x80000000L
#define PAL_MAX_UINT64      0xFFFFFFFFFFFFFFFFULL
#define PAL_MAX_INT64       0x7FFFFFFFFFFFFFFFLL

// useful macros

#define PAL_MAX(a,b)            ((a) > (b) ? (a) : (b))

#define PAL_MIN(a,b)            ((a) < (b) ? (a) : (b))

#define PAL_DIVIDE_ROUND_UP(num, divider)           (((num) + (divider) - 1) / (divider))

#if PAL_COMPILATION_ENDIANITY == 1
#define BIG__ENDIAN 1
#elif PAL_COMPILATION_ENDIANITY == 0
#define LITTLE__ENDIAN 1
#else 
#error neither BIG__ENDIAN nor LITTLE__ENDIAN defined, cannot compile
#endif

// endianity macros
#ifdef LITTLE__ENDIAN

#define PAL_HTONS(x) (((((unsigned short)(x)) >> 8) & 0xff) | \
            ((((unsigned short)(x)) & 0xff) << 8))
#define PAL_NTOHS(x) (((((unsigned short)(x)) >> 8) & 0xff) | \
            ((((unsigned short)(x)) & 0xff) << 8) )
#define PAL_HTONL(x) ((((x)>>24) & 0xffL) | (((x)>>8) & 0xff00L) | \
            (((x)<<8) & 0xff0000L) | (((x)<<24) & 0xff000000L))
#define PAL_NTOHL(x) ((((x)>>24) & 0xffL) | (((x)>>8) & 0xff00L) | \
            (((x)<<8) & 0xff0000L) | (((x)<<24) & 0xff000000L))

#elif defined(BIG__ENDIAN)

#define PAL_HTONS(x) (x)
#define PAL_NTOHS(x) (x)
#define PAL_HTONL(x) (x)
#define PAL_NTOHL(x) (x)
#else
#error neither BIG__ENDIAN nor LITTLE__ENDIAN defined, cannot compile
#endif



#define PAL_INVERSE_UINT16_BYTES( val ) \
    ( ((val) << 8) | (((val) & 0x0000FF00) >> 8))

#define PAL_INVERSE_UINT32_BYTES( val ) \
   ( ((val) >> 24) | (((val) & 0x00FF0000) >> 8) | (((val) & 0x0000FF00) << 8) | (((val) & 0x000000FF) << 24) )

#define PAL_INVERSE_UINT64_BYTES( val ) \
    ((PAL_INVERSE_UINT32_BYTES( ((val >> 16) >> 16)) &0xffffffff)  | ((((uint64_t)PAL_INVERSE_UINT32_BYTES(val & 0xffffffff))<<16)<<16)) 

/* Set of Macros similar to the HTONS/L, NTOHS/L ones but converting to/from little endian instead of big endian*/
#ifdef LITTLE__ENDIAN 
#define PAL_LITTLE_ENDIAN_TO_HOST_16BIT(x) (x)
#define PAL_LITTLE_ENDIAN_TO_HOST_32BIT(x) (x)
#define PAL_LITTLE_ENDIAN_TO_HOST_64BIT(x) (x)
#define PAL_HOST_TO_LITTLE_ENDIAN_16BIT(x) (x)
#define PAL_HOST_TO_LITTLE_ENDIAN_32BIT(x) (x)
#define PAL_HOST_TO_LITTLE_ENDIAN_64BIT(x) (x)


#elif defined(BIG__ENDIAN)
#define PAL_LITTLE_ENDIAN_TO_HOST_16BIT(x) (PAL_INVERSE_UINT16_BYTES(((uint16_t)x)))
#define PAL_LITTLE_ENDIAN_TO_HOST_32BIT(x) (PAL_INVERSE_UINT32_BYTES(((uint32_t)x)))
#define PAL_LITTLE_ENDIAN_TO_HOST_64BIT(x) (PAL_INVERSE_UINT64_BYTES(((uint64_t)x)))
#define PAL_HOST_TO_LITTLE_ENDIAN_16BIT(x) (PAL_INVERSE_UINT16_BYTES(((uint16_t)x)))
#define PAL_HOST_TO_LITTLE_ENDIAN_32BIT(x) (PAL_INVERSE_UINT32_BYTES(((uint32_t)x)))
#define PAL_HOST_TO_LITTLE_ENDIAN_64BIT(x) (PAL_INVERSE_UINT64_BYTES(((uint64_t)x)))

#else
#error neither BIG__ENDIAN nor LITTLE__ENDIAN defined, cannot compile
#endif


#define PAL_MODULE_INIT(INIT) INIT= 1
#define PAL_MODULE_DEINIT(INIT) INIT= 0

#ifdef DEBUG
#include "pal.h"
#define DEBUG_PRINT(ARGS...) PAL_PRINTF(ARGS)

#define DEBUG_PRINT(ARGS...) PAL_PRINTF(ARGS)
#define PAL_MODULE_IS_INIT(INIT) if(!INIT) return PAL_ERR_NOT_INITIALIZED;


#else
#define PAL_MODULE_IS_INIT(INIT)

#define DEBUG_PRINT(ARGS...)

#endif //DEBUG

#ifdef __cplusplus
}
#endif
#endif //_PAL_MACROS_H
