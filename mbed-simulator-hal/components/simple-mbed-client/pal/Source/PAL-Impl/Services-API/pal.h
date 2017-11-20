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


#ifndef _PAL_H
#define _PAL_H

#ifdef __cplusplus
extern "C" {
#endif


//includes for common headers in PAL
#include "pal_macros.h"
#include "pal_configuration.h"
#include "pal_errors.h"
#include "pal_types.h"

//includes for modules headers.
#include "pal_rtos.h"
//#include "pal_socket.h"



//declarations for global init and destroy of PAL

/*! PAL initialization
*   This function will call each module's initialization function (if exist)
*   to allocate required resources and initiate them.
* \return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS(0) in case of success 
*   and another negative value indicating a specific error code in case of failure
*/
palStatus_t pal_init();

/*! PAL destruction
*   This function will call each module's destroy function (if exist)
*   to free resources.
*/
void pal_destroy();


#ifdef __cplusplus
}
#endif
#endif //_PAL_H
