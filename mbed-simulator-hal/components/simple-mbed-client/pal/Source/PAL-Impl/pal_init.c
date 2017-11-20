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
#include "pal_plat_rtos.h"
#include "pal_plat_network.h"
#include "pal_macros.h"

//this variable must be a int32_t for using atomic increment
static int32_t g_palIntialized = 0;


palStatus_t pal_init()
{

    palStatus_t status = PAL_SUCCESS;
    int32_t currentInitValue;
    //  get the return value of g_palIntialized+1 to save it locally
    currentInitValue = pal_osAtomicIncrement(&g_palIntialized,1);
    // if increased for the 1st time
    if (1 == currentInitValue)
    {
        DEBUG_PRINT("Init for the 1st time, initializing the modules\r\n");
        status = pal_plat_RTOSInitialize(NULL);
        if (PAL_SUCCESS == status)
        {

            status = pal_plat_socketsInit(NULL);
            if (PAL_SUCCESS != status)
            {
                DEBUG_PRINT("init of network module has failed with status %d\r\n",status);
            }
        }
        else
        {
            DEBUG_PRINT("init of RTOS module has failed with status %d\r\n",status);
        }
    }
    // if failed decrees the value of g_palIntialized
    if (PAL_SUCCESS != status)
    {
        pal_plat_socketsTerminate(NULL);
        pal_plat_RTOSDestroy();
        pal_osAtomicIncrement(&g_palIntialized, -1);
    }
    return status;
}


void pal_destroy()
{
    int32_t currentInitValue;
    // get the current value of g_palIntialized locally
    currentInitValue = pal_osAtomicIncrement(&g_palIntialized, -1);
    if (0 == currentInitValue)
    {
        DEBUG_PRINT("Destroying modules\r\n");
        pal_plat_RTOSDestroy();
        pal_plat_socketsTerminate(NULL);
    }
}
