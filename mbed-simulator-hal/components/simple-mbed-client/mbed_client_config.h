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
#ifndef MBED_CLIENT_CONFIG_H
#define MBED_CLIENT_CONFIG_H


// Defines the number of times client should try re-connection towards
// Server in case of connectivity loss , also defines the number of CoAP
// re-transmission attempts.Default value is 3
#define M2M_CLIENT_RECONNECTION_COUNT		3

// Defines the interval (in seconds) in which client should try re-connection towards
// Server in case of connectivity loss , also use the same interval for CoAP
// re-transmission attempts. Default value is 5 seconds
#define M2M_CLIENT_RECONNECTION_INTERVAL	5

// Defines the keep-alive interval (in seconds) in which client should send keep alive
// pings to server while connected through TCP mode. Default value is 300 seconds
#define M2M_CLIENT_TCP_KEEPALIVE_TIME 		300

// Defines the maximum CoAP messages that client can hold, maximum value is 6
#define SN_COAP_DUPLICATION_MAX_MSGS_COUNT  2

// Defines the size of blockwise CoAP messages that client can handle.
// The values that can be defined uust be 2^x and x is at least 4.
// Suitable values: 0, 16, 32, 64, 128, 256, 512 and 1024
#define SN_COAP_MAX_BLOCKWISE_PAYLOAD_SIZE  1024

// Many pure LWM2M servers doen't accept 'obs' text in registration message.
// While using Client against such servers, this flag can be set to define to
// disable client sending 'obs' text for observable resources.
#undef COAP_DISABLE_OBS_FEATURE

// Disable Bootstrap functionality in client in order to reduce code size, if bootstrap
// functionality is not required.
#undef M2M_CLIENT_DISABLE_BOOTSTRAP_FEATURE

#endif // MBED_CLIENT_CONFIG_H
