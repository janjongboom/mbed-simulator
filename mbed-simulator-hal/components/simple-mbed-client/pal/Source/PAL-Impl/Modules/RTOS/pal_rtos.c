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


#include "pal_rtos.h"
#include "pal_plat_rtos.h"

#if PAL_UNIQUE_THREAD_PRIORITY
//! Threads priorities array.
uint8_t g_palThreadPriorities[PAL_MAX_NUMBER_OF_THREADS] = {0};
#endif //PAL_UNIQUE_THREAD_PRIORITY

void pal_osReboot(void)
{
    pal_plat_osReboot();
}

uint32_t pal_osKernelSysTick(void)
{
    uint32_t result;
    result = pal_plat_osKernelSysTick();
    return result;
}


uint64_t pal_osKernelSysTick64(void)
{

#if PAL_RTOS_64BIT_TICK_SUPPORTED
    uint64_t result;
    result = pal_plat_osKernelSysTick64();
    return result;
#else
    static uint64_t lastValue = 0;
    static uint64_t wraparoundsDetected = 0;
    const uint64_t one = 1;
    uint64_t tmp = pal_plat_osKernelSysTick() + (wraparoundsDetected << 32);
    if (tmp < lastValue) //erez's "wraparound algorithm" if we detect a wrap around add 1 to the higher 32 bits
    {
        tmp = tmp + (one << 32);
        wraparoundsDetected++;
    }
    lastValue = tmp;
    return (uint64_t)tmp;
#endif
}

uint64_t pal_osKernelSysTickMicroSec(uint64_t microseconds)
{
    uint64_t result;
    result = pal_plat_osKernelSysTickMicroSec(microseconds);
    return result;
}

uint64_t pal_osKernelSysMilliSecTick(uint64_t sysTicks)
{
    uint64_t result;
    result = pal_plat_osKernelSysMilliSecTick(sysTicks);
    return result;
}

uint64_t pal_osKernelSysTickFrequency(void)
{
    uint64_t result;
    result = pal_plat_osKernelSysTickFrequency();
    return result;
}

palStatus_t pal_osThreadCreate(palThreadFuncPtr function, void* funcArgument, palThreadPriority_t priority, uint32_t stackSize, uint32_t* stackPtr, palThreadLocalStore_t* store, palThreadID_t* threadID)
{
    palStatus_t status = PAL_SUCCESS;

#if PAL_UNIQUE_THREAD_PRIORITY
    //! check if the priority have been used by other thread before
    if(PAL_osPriorityError == priority)
    {
        status = PAL_ERR_INVALID_ARGUMENT;
    }

    if ((PAL_SUCCESS == status) && (g_palThreadPriorities[priority+PRIORYT_INDEX_OFFSET]))
    {
        *threadID = NULLPTR;
        status = PAL_ERR_RTOS_PRIORITY;
    }
#endif //PAL_IGNORE_UNIQUE_THREAD_PRIORITY

    if (PAL_SUCCESS == status)
    {
        status = pal_plat_osThreadCreate(function, funcArgument, priority, stackSize, stackPtr, store, threadID);
    }       
    return status;
}

palStatus_t pal_osThreadTerminate(palThreadID_t* threadID)
{
    palStatus_t status;
    status = pal_plat_osThreadTerminate(threadID);
    return status;
}

palThreadID_t pal_osThreadGetId(void)
{
    palThreadID_t result;
    result = pal_plat_osThreadGetId();
    return result;
}

void*  pal_osThreadGetLocalStore(void)
{
    void* result;
    result = pal_plat_osThreadGetLocalStore();
    return result;
}

palStatus_t pal_osDelay(uint32_t milliseconds)
{
    palStatus_t status;
    status = pal_plat_osDelay(milliseconds);
    return status;
}


palStatus_t pal_osTimerCreate(palTimerFuncPtr function, void* funcArgument, palTimerType_t timerType, palTimerID_t* timerID)
{
    palStatus_t status;
    status = pal_plat_osTimerCreate(function, funcArgument, timerType, timerID);
    return status;
}

palStatus_t pal_osTimerStart(palTimerID_t timerID, uint32_t millisec)
{
    palStatus_t status;
    status = pal_plat_osTimerStart(timerID, millisec);
    return status;
}

palStatus_t pal_osTimerStop(palTimerID_t timerID)
{
    palStatus_t status;
    status = pal_plat_osTimerStop(timerID);
    return status;
}

palStatus_t pal_osTimerDelete(palTimerID_t* timerID)
{
    palStatus_t status;
    status = pal_plat_osTimerDelete(timerID);
    return status;
}

palStatus_t pal_osMutexCreate(palMutexID_t* mutexID)
{
    palStatus_t status;
    status = pal_plat_osMutexCreate(mutexID);
    return status;
}

palStatus_t pal_osMutexWait(palMutexID_t mutexID, uint32_t millisec)
{
    palStatus_t status;
    status = pal_plat_osMutexWait(mutexID, millisec);
    return status;
}

palStatus_t pal_osMutexRelease(palMutexID_t mutexID)
{
    palStatus_t status;
    status = pal_plat_osMutexRelease(mutexID);
    return status;
}

palStatus_t pal_osMutexDelete(palMutexID_t* mutexID)
{
    palStatus_t status;
    status = pal_plat_osMutexDelete(mutexID);
    return status;
}
palStatus_t pal_osSemaphoreCreate(uint32_t count, palSemaphoreID_t* semaphoreID)
{
    palStatus_t status;
    status = pal_plat_osSemaphoreCreate(count, semaphoreID);
    return status;
}

palStatus_t pal_osSemaphoreWait(palSemaphoreID_t semaphoreID, uint32_t millisec,  int32_t* countersAvailable)
{
    palStatus_t status;
    status = pal_plat_osSemaphoreWait(semaphoreID, millisec, countersAvailable);
    return status;
}

palStatus_t pal_osSemaphoreRelease(palSemaphoreID_t semaphoreID)
{
    palStatus_t status;
    status = pal_plat_osSemaphoreRelease(semaphoreID);
    return status;
}

palStatus_t pal_osSemaphoreDelete(palSemaphoreID_t* semaphoreID)
{
    palStatus_t status;
    status = pal_plat_osSemaphoreDelete(semaphoreID);
    return status;
}

palStatus_t pal_osPoolCreate(uint32_t blockSize, uint32_t blockCount, palMemoryPoolID_t* memoryPoolID)
{
    palStatus_t status;
    status = pal_plat_osPoolCreate(blockSize, blockCount, memoryPoolID);
    return status;
}

void* pal_osPoolAlloc(palMemoryPoolID_t memoryPoolID)
{
    void* result;
    result = pal_plat_osPoolAlloc(memoryPoolID);
    return result;
}

void* pal_osPoolCAlloc(palMemoryPoolID_t memoryPoolID)
{
    void* result;
    //TODO(nirson01): debug print in case of failed alloc?
    result = pal_plat_osPoolCAlloc(memoryPoolID);
    return result;
}

palStatus_t pal_osPoolFree(palMemoryPoolID_t memoryPoolID, void* block)
{
    palStatus_t status;
    //TODO(nirson01): debug print in case of failed alloc?
    status = pal_plat_osPoolFree(memoryPoolID, block);
    return status;
}

palStatus_t pal_osPoolDestroy(palMemoryPoolID_t* memoryPoolID)
{
    palStatus_t status;
    status = pal_plat_osPoolDestroy(memoryPoolID);  
    return status;
}

palStatus_t pal_osMessageQueueCreate(uint32_t messageQSize, palMessageQID_t* messageQID)
{
    palStatus_t status;
    status = pal_plat_osMessageQueueCreate(messageQSize, messageQID);
    return status;
}

palStatus_t pal_osMessagePut(palMessageQID_t messageQID, uint32_t info, uint32_t timeout)
{
    palStatus_t status;
    status = pal_plat_osMessagePut(messageQID, info, timeout);
    return status;
}

palStatus_t pal_osMessageGet(palMessageQID_t messageQID, uint32_t timeout, uint32_t* messageValue)
{
    palStatus_t status;
    status = pal_plat_osMessageGet(messageQID, timeout, messageValue);
    return status;
}

palStatus_t pal_osMessageQueueDestroy(palMessageQID_t* messageQID)
{
    palStatus_t status;
    status = pal_plat_osMessageQueueDestroy(messageQID);
    return status;
}

int32_t pal_osAtomicIncrement(int32_t* valuePtr, int32_t increment)
{
    int32_t result;
    result = pal_plat_osAtomicIncrement(valuePtr, increment);
    return result;
}



#ifdef DEBUG
#include "stdarg.h"
#endif

void dbgPrintf( const char* function, uint32_t line, const char * format, ... )
{
#ifdef DEBUG
    static palMutexID_t printfMutex = NULLPTR;

    va_list args;
    if (!printfMutex)
    {
        pal_osMutexCreate(&printfMutex);
    }
    pal_osMutexWait(printfMutex, PAL_MAX_UINT32);
#ifdef VERBOSE
    pal_plat_printf("%s:%ld\t",function,line);
#endif
    va_start (args, format);
    pal_plat_vprintf (format, args);
    va_end (args);
    pal_osMutexRelease(printfMutex);
#endif
}



