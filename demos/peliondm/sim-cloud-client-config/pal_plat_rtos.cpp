/*******************************************************************************
 * Copyright 2016, 2017 ARM Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *******************************************************************************/


#include "pal.h"
#include <stdlib.h>
#include <string.h>
#include "pal_plat_rtos.h"
#include "mbed.h"
#include "entropy_poll.h"

#define TRACE_GROUP "PAL"

void pal_plat_osReboot()
{
    printf("reboot\n");
}

palStatus_t pal_plat_RTOSInitialize(void* opaqueContext)
{
    return PAL_SUCCESS;
}

palStatus_t pal_plat_RTOSDestroy(void)
{
    return PAL_SUCCESS;
}

palStatus_t pal_plat_osDelay(uint32_t milliseconds)
{
    wait_ms(milliseconds);
}

uint64_t pal_plat_osKernelSysTick(void)
{
    printf("getkernelsystick\n");
    return 0;
}

uint64_t pal_plat_osKernelSysTickMicroSec(uint64_t microseconds)
{
    printf("getkernelsystickmicro\n");
    return 0;
}

uint64_t pal_plat_osKernelSysTickFrequency()
{
    printf("osKernelSysTickFrequency\n");
    return 100;
}

palStatus_t pal_plat_osThreadCreate(palThreadFuncPtr function, void* funcArgument, palThreadPriority_t priority, uint32_t stackSize, palThreadID_t* threadID)
{
    return PAL_SUCCESS;
}

palThreadID_t pal_plat_osThreadGetId(void)
{
    return 10;
}

palStatus_t pal_plat_osThreadTerminate(palThreadID_t* threadID)
{
    return PAL_SUCCESS;
}

palStatus_t pal_plat_osTimerCreate(palTimerFuncPtr function, void* funcArgument, palTimerType_t timerType, palTimerID_t* timerID)
{
    printf("osTimerCreate\n");
    return PAL_SUCCESS;
}

palStatus_t pal_plat_osTimerStart(palTimerID_t timerID, uint32_t millisec)
{
    printf("osTimerStart\n");
    return PAL_SUCCESS;
}

palStatus_t pal_plat_osTimerStop(palTimerID_t timerID)
{
    printf("osTimerStart\n");
    return PAL_SUCCESS;
}

palStatus_t pal_plat_osTimerDelete(palTimerID_t* timerID)
{
    printf("osTimerDelete\n");
    return PAL_SUCCESS;
}


palStatus_t pal_plat_osMutexCreate(palMutexID_t* mutexID)
{
    return PAL_SUCCESS;
}


palStatus_t pal_plat_osMutexWait(palMutexID_t mutexID, uint32_t millisec)
{
    return PAL_SUCCESS;
}


palStatus_t pal_plat_osMutexRelease(palMutexID_t mutexID)
{
    return PAL_SUCCESS;
}

palStatus_t pal_plat_osMutexDelete(palMutexID_t* mutexID)
{
    return PAL_SUCCESS;
}

palStatus_t pal_plat_osSemaphoreCreate(uint32_t count, palSemaphoreID_t* semaphoreID)
{
    return PAL_SUCCESS;
}

palStatus_t pal_plat_osSemaphoreWait(palSemaphoreID_t semaphoreID, uint32_t millisec, int32_t* countersAvailable)
{
    return PAL_SUCCESS;
}

palStatus_t pal_plat_osSemaphoreRelease(palSemaphoreID_t semaphoreID)
{
    return PAL_SUCCESS;
}

palStatus_t pal_plat_osSemaphoreDelete(palSemaphoreID_t* semaphoreID)
{
    return PAL_SUCCESS;
}

int32_t pal_plat_osAtomicIncrement(int32_t* valuePtr, int32_t increment)
{
    *valuePtr += increment;
}


 void *pal_plat_malloc(size_t len)
{
	return malloc(len);
}


 void pal_plat_free(void * buffer)
{
	return free(buffer);
}
