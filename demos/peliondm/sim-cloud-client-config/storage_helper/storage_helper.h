// ----------------------------------------------------------------------------
// Copyright 2016-2018 ARM Ltd.
//
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ----------------------------------------------------------------------------

#ifndef SIMPLEMBEDCLOUDCLIENT_STORAGEHELPER_H_
#define SIMPLEMBEDCLOUDCLIENT_STORAGEHELPER_H_

#include "mbed.h"
#include "BlockDevice.h"
#include "factory_configurator_client.h"

// This is for single or dual partition mode. This is supposed to be used with storage for data e.g. SD card.
// Enable by 1/disable by 0.
#ifndef MCC_PLATFORM_PARTITION_MODE
#define MCC_PLATFORM_PARTITION_MODE 0
#endif

#include "pal.h"

// Include this only for Developer mode and device which doesn't have in-built TRNG support
#if MBED_CONF_APP_DEVELOPER_MODE == 1
#ifdef PAL_USER_DEFINED_CONFIGURATION
#define FCC_ROT_SIZE                       16
const uint8_t MBED_CLOUD_DEV_ROT[FCC_ROT_SIZE] = { 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16 };
#if !PAL_USE_HW_TRNG
#define FCC_ENTROPY_SIZE                   48
const uint8_t MBED_CLOUD_DEV_ENTROPY[FCC_ENTROPY_SIZE] = { 0xf6, 0xd6, 0xc0, 0x09, 0x9e, 0x6e, 0xf2, 0x37, 0xdc, 0x29, 0x88, 0xf1, 0x57, 0x32, 0x7d, 0xde, 0xac, 0xb3, 0x99, 0x8c, 0xb9, 0x11, 0x35, 0x18, 0xeb, 0x48, 0x29, 0x03, 0x6a, 0x94, 0x6d, 0xe8, 0x40, 0xc0, 0x28, 0xcc, 0xe4, 0x04, 0xc3, 0x1f, 0x4b, 0xc2, 0xe0, 0x68, 0xa0, 0x93, 0xe6, 0x3a };
#endif // PAL_USE_HW_TRNG = 0
#endif // PAL_USER_DEFINED_CONFIGURATION
#endif // #if MBED_CONF_APP_DEVELOPER_MODE == 1

class StorageHelper {
public:
    StorageHelper();

    int init();
    int sotp_init();
    int reformat_storage(void);
};

#endif // SIMPLEMBEDCLOUDCLIENT_STORAGEHELPER_H_
