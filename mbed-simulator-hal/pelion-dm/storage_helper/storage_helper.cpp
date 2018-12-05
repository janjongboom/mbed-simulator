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

#include "storage_helper.h"
#include "mbed_trace.h"

#define TRACE_GROUP "SMCS"

StorageHelper::StorageHelper()
{

}

int StorageHelper::init() {
    return 0;
}

int StorageHelper::sotp_init(void)
{
    int status = FCC_STATUS_SUCCESS;
// Include this only for Developer mode and a device which doesn't have in-built TRNG support.
#if MBED_CONF_APP_DEVELOPER_MODE == 1
#ifdef PAL_USER_DEFINED_CONFIGURATION
#if !PAL_USE_HW_TRNG
    status = fcc_entropy_set(MBED_CLOUD_DEV_ENTROPY, FCC_ENTROPY_SIZE);

    if (status != FCC_STATUS_SUCCESS && status != FCC_STATUS_ENTROPY_ERROR) {
        tr_error("fcc_entropy_set failed with status %d", status);
        fcc_finalize();
        return status;
    }
#endif // PAL_USE_HW_TRNG = 0
/* Include this only for Developer mode. The application will use fixed RoT to simplify user-experience with the application.
* With this change the application be reflashed/SOTP can be erased safely without invalidating the application credentials.
*/
    status = fcc_rot_set(MBED_CLOUD_DEV_ROT, FCC_ROT_SIZE);

    if (status != FCC_STATUS_SUCCESS && status != FCC_STATUS_ROT_ERROR) {
        tr_error("fcc_rot_set failed with status %d", status);
        fcc_finalize();
    } else {
        // We can return SUCCESS here as preexisting RoT/Entropy is expected flow.
        tr_info("Using hardcoded Root of Trust, not suitable for production use");
        status = FCC_STATUS_SUCCESS;
    }
#endif // PAL_USER_DEFINED_CONFIGURATION
#endif // #if MBED_CONF_APP_DEVELOPER_MODE == 1
    return status;
}


int StorageHelper::reformat_storage(void) {
    return 0;
}
