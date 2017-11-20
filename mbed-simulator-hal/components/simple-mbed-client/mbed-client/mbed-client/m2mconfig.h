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
#ifndef M2MCONFIG_H
#define M2MCONFIG_H

/*! \file m2mconfig.h
* \brief File defining all system build time configuration used by mbed-client.
*/

#include "mbed-client/m2mstring.h"

#include <stddef.h>

using namespace m2m;

/**
 * \def MBED_CLIENT_RECONNECTION_COUNT
 *
 * \brief Sets Reconnection count for mbed Client
 * to attempt a reconnection re-tries until
 * reaches the defined value either by the application
 * or the default value set in Client.
 * By default, the value is 3.
 */
#undef MBED_CLIENT_RECONNECTION_COUNT  /* 3 */

/**
 * \def MBED_CLIENT_RECONNECTION_INTERVAL
 *
 * \brief Sets Reconnection interval (in seconds) for
 * mbed Client to attempt a reconnection re-tries.
 * By default, the value is 5 seconds.
 */
#undef MBED_CLIENT_RECONNECTION_INTERVAL  /* 5 */

/**
 * \def MBED_CLIENT_TCP_KEEPALIVE_TIME
 *
 * \brief Keep alive time (in seconds) to send pings
 * in case mbed Client is connected through TCP.
 * By default, the value is 300 seconds.
 */
#undef MBED_CLIENT_TCP_KEEPALIVE_TIME   /* 300 */

/**
 * \def MBED_CLIENT_RECONNECTION_LOOP
 *
 * \brief Option whether to continue reconnection
 * loop until connection is re-established or stop
 * once the maximum re-try count is reached
 * By default, the value is 1 to continue reconnection
 * in loop, to stop the reconnection loop set value to 0.
 */
#undef MBED_CLIENT_RECONNECTION_LOOP    /* 1 */

/**
 * \def MBED_CLIENT_EVENT_LOOP_SIZE
 *
 * \brief Defines the size of memory allocated for
 * event loop (in bytes) for timer and network event
 * handling of mbed Client.
 * By default, this value is 1024 bytes.This memory is
 * allocated from heap
 */
#undef MBED_CLIENT_EVENT_LOOP_SIZE      /* 1024 */

#ifdef YOTTA_CFG_RECONNECTION_COUNT
#define MBED_CLIENT_RECONNECTION_COUNT YOTTA_CFG_RECONNECTION_COUNT
#elif defined MBED_CONF_MBED_CLIENT_RECONNECTION_COUNT
#define MBED_CLIENT_RECONNECTION_COUNT MBED_CONF_MBED_CLIENT_RECONNECTION_COUNT
#endif

#ifdef YOTTA_CFG_RECONNECTION_INTERVAL
#define MBED_CLIENT_RECONNECTION_INTERVAL YOTTA_CFG_RECONNECTION_INTERVAL
#elif defined MBED_CONF_MBED_CLIENT_RECONNECTION_INTERVAL
#define MBED_CLIENT_RECONNECTION_INTERVAL MBED_CONF_MBED_CLIENT_RECONNECTION_INTERVAL
#endif

#ifdef YOTTA_CFG_TCP_KEEPALIVE_TIME
#define MBED_CLIENT_TCP_KEEPALIVE_TIME YOTTA_CFG_TCP_KEEPALIVE_TIME
#elif defined MBED_CONF_MBED_CLIENT_TCP_KEEPALIVE_TIME
#define MBED_CLIENT_TCP_KEEPALIVE_TIME MBED_CONF_MBED_CLIENT_TCP_KEEPALIVE_TIME
#endif

#ifdef YOTTA_CFG_DISABLE_BOOTSTRAP_FEATURE
#define MBED_CLIENT_DISABLE_BOOTSTRAP_FEATURE YOTTA_CFG_DISABLE_BOOTSTRAP_FEATURE
#elif defined MBED_CONF_MBED_CLIENT_DISABLE_BOOTSTRAP_FEATURE
#define MBED_CLIENT_DISABLE_BOOTSTRAP_FEATURE MBED_CONF_MBED_CLIENT_DISABLE_BOOTSTRAP_FEATURE
#endif

#ifdef YOTTA_CFG_RECONNECTION_LOOP
#define MBED_CLIENT_RECONNECTION_LOOP YOTTA_CFG_RECONNECTION_LOOP
#elif defined MBED_CONF_MBED_CLIENT_RECONNECTION_LOOP
#define MBED_CLIENT_RECONNECTION_LOOP MBED_CONF_MBED_CLIENT_RECONNECTION_LOOP
#endif

#ifdef YOTTA_CFG_COAP_MAX_INCOMING_BLOCK_MESSAGE_SIZE
#define SN_COAP_MAX_INCOMING_MESSAGE_SIZE YOTTA_CFG_COAP_MAX_INCOMING_BLOCK_MESSAGE_SIZE
#elif defined MBED_CONF_MBED_CLIENT_SN_COAP_MAX_INCOMING_MESSAGE_SIZE
#define SN_COAP_MAX_INCOMING_MESSAGE_SIZE MBED_CONF_MBED_CLIENT_SN_COAP_MAX_INCOMING_MESSAGE_SIZE
#endif

#ifdef MBED_CONF_MBED_CLIENT_EVENT_LOOP_SIZE
#define MBED_CLIENT_EVENT_LOOP_SIZE MBED_CONF_MBED_CLIENT_EVENT_LOOP_SIZE
#endif

#if defined (__ICCARM__)
#define m2m_deprecated
#else
#define m2m_deprecated __attribute__ ((deprecated))
#endif

// This is valid for mbed-client-mbedtls
// For other SSL implementation there
// can be other

/*
*\brief A callback function for a random number
* required by the mbed-client-mbedtls module.
*/
typedef uint32_t (*random_number_cb)(void) ;

/*
*\brief An entropy structure for an mbedtls entropy source.
* \param entropy_source_ptr The entropy function.
* \param p_source  The function data.
* \param threshold A minimum required from the source before entropy is released
*                  (with mbedtls_entropy_func()) (in bytes).
* \param strong    MBEDTLS_ENTROPY_SOURCE_STRONG = 1 or
*                  MBEDTSL_ENTROPY_SOURCE_WEAK = 0.
*                  At least one strong source needs to be added.
*                  Weaker sources (such as the cycle counter) can be used as
*                  a complement.
*/
typedef struct mbedtls_entropy {
    int     (*entropy_source_ptr)(void *, unsigned char *,size_t , size_t *);
    void    *p_source;
    size_t  threshold;
    int     strong;
}entropy_cb;

#ifdef MBED_CLIENT_USER_CONFIG_FILE
#include MBED_CLIENT_USER_CONFIG_FILE
#endif

#ifndef MBED_CLIENT_RECONNECTION_COUNT
#define MBED_CLIENT_RECONNECTION_COUNT 3
#endif

#ifndef MBED_CLIENT_RECONNECTION_INTERVAL
#define MBED_CLIENT_RECONNECTION_INTERVAL 5
#endif

#ifndef MBED_CLIENT_TCP_KEEPALIVE_TIME
#define MBED_CLIENT_TCP_KEEPALIVE_TIME 300
#endif

#ifndef MBED_CLIENT_RECONNECTION_LOOP
#define MBED_CLIENT_RECONNECTION_LOOP 1
#endif

#ifndef MBED_CLIENT_EVENT_LOOP_SIZE
#define MBED_CLIENT_EVENT_LOOP_SIZE 1024
#endif

#ifndef SN_COAP_MAX_INCOMING_MESSAGE_SIZE
#define SN_COAP_MAX_INCOMING_MESSAGE_SIZE UINT16_MAX
#endif

#endif // M2MCONFIG_H
