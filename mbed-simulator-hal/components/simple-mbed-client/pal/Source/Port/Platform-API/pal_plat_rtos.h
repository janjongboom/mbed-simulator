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


#ifndef _PAL_PLAT_RTOS_H
#define _PAL_PLAT_RTOS_H

#ifdef __cplusplus
extern "C" {
#endif

#include "pal_rtos.h"
#include "pal_configuration.h"
#include "pal_types.h"

#if PAL_UNIQUE_THREAD_PRIORITY
//! This array holds a counter for each thread priority.
//! If the counter is more than 1, it means that more than 
//! one thread has the same priority and this is a forbidden
//! situation. The mapping between the priorities and the index
//! in the array is as follow:
//!
//! PAL_osPriorityIdle --> g_palThreadPriorities[0]
//! PAL_osPriorityLow --> g_palThreadPriorities[1]
//! PAL_osPriorityBelowNormal --> g_palThreadPriorities[2]
//! PAL_osPriorityNormal --> g_palThreadPriorities[3]
//! PAL_osPriorityAboveNormal --> g_palThreadPriorities[4]
//! PAL_osPriorityHigh --> g_palThreadPriorities[5]
//! PAL_osPriorityRealtime --> g_palThreadPriorities[6]

//! An array of PAL thread priorities. The size of the array is defined in the Service API (pal_rtos.h) by "PAL_MAX_NUMBER_OF_THREADS"
extern uint8_t g_palThreadPriorities[PAL_MAX_NUMBER_OF_THREADS];

#define PRIORYT_INDEX_OFFSET 3
#endif //PAL_UNIQUE_THREAD_PRIORITY

/*! Initiate a system reboot.
*/
void pal_plat_osReboot(void);

/*! Initialize all data structures (semaphores, mutexes, memory pools, message queues) at system initialization.
*   In case of a failure in any of the initializations, the function returns with an error and stops the rest of the initializations.
* @param[in] opaqueContext The context passed to the initialization (not required for generic CMSIS, pass NULL in this case).
* \return PAL_SUCCESS(0) in case of success, PAL_ERR_CREATION_FAILED in case of failure.
*/
palStatus_t pal_plat_RTOSInitialize(void* opaqueContext);

/*! De-Initialize thread objects.
*/
void pal_plat_RTOSDestroy(void);

/*! Get the RTOS kernel system timer counter.
*
* \return The RTOS kernel system timer counter.
*
* \note The required tick counter is the OS (platform) kernel system tick counter.
* \note This counter wraps around very often (for example, once every 42 sec for 100Mhz).
*/
uint32_t pal_plat_osKernelSysTick();

/*! Get the RTOS kernel system timer counter.
*
* \return The RTOS kernel system timer counter.
*
* \note The required tick counter is the OS (platform) kernel system tick counter.
*/
uint64_t pal_plat_osKernelSysTick64(void); // optional API - not part of original CMSIS API.

/*! Convert the value from microseconds to kernel sys ticks.
* This is the same as CMSIS macro osKernelSysTickMicroSec.
*/
uint64_t pal_plat_osKernelSysTickMicroSec(uint64_t microseconds);

/*! Convert the value from kernel system ticks to milliseconds.
*
* @param[in] sysTicks The number of kernel system ticks to convert into millieseconds.
*
* \return The converted value in system ticks.
*/
uint64_t pal_plat_osKernelSysMilliSecTick(uint64_t sysTicks);

/*! Get the system tick frequency.
* \return The system tick frequency.
*/
uint64_t pal_plat_osKernelSysTickFrequency(void);

/*! Create and start a thread function.
*
* @param[in] function A function pointer to the thread callback function.
* @param[in] funcArgument An argument for the thread function.
* @param[in] priority The priority of the thread.
* @param[in] stackSize The stack size of the thread.
* @param[in] stackPtr A pointer to the thread's stack.
* @param[in] store A pointer to thread's local store, can be NULL.
* @param[out] threadID The created thread ID handle, zero indicates an error.
*
* \return The ID of the created thread, in case of error return zero.
* \note Each thread MUST have a unique priority.
* \note When the priority of the created thread function is higher than the current running thread, the 
*       created thread function starts instantly and becomes the new running thread. 
* \note the create function MUST not wait for platform resources and it should return "PAL_ERR_RTOS_RESOURCE", unless the platform API is blocking.
*/
palStatus_t pal_plat_osThreadCreate(palThreadFuncPtr function, void* funcArgument, palThreadPriority_t priority, uint32_t stackSize, uint32_t* stackPtr, palThreadLocalStore_t* store, palThreadID_t* threadID);

/*! Terminate and free allocated data for the thread.
*
* @param[in] threadID The ID of the thread to stop and terminate.
*
* \return palStatus_t; PAL_SUCCESS(0) in case of success, a negative value indicating a specific error code in case of failure.
*/
palStatus_t pal_plat_osThreadTerminate(palThreadID_t* threadID);

/*! Get the ID of the current thread.
* \return The ID of the current thread, in case of error return PAL_MAX_UINT32.
* \note For a thread with real time priority, the function always returns PAL_MAX_UINT32.
*/
palThreadID_t pal_plat_osThreadGetId();

/*! Get the storage of the current thread.
* \return The storage of the current thread.
*/
void* pal_plat_osThreadGetLocalStore();

/*! Wait for a specified period of time in milliseconds.
*
* @param[in] milliseconds The number of milliseconds to wait before proceeding.
*
* \return The status in the form of palStatus_t; PAL_SUCCESS(0) in case of success, a negative value indicating a specific error code in case of failure.
*/
palStatus_t pal_plat_osDelay(uint32_t milliseconds);

/*! Create a timer.
*
* @param[in] function A function pointer to the timer callback function.
* @param[in] funcArgument An argument for the timer callback function.
* @param[in] timerType The timer type to be created, periodic or oneShot.
* @param[out] timerID The ID of the created timer, zero value indicates an error.
*
* \return PAL_SUCCESS when the timer was created successfully. A specific error in case of failure.
*         PAL_ERR_NO_MEMORY: no memory resource available to create timer object.
*
* \note the timer callback function runs according to the platform resources of stack-size and priority.
* \note the create function MUST not wait for platform resources and it should return "PAL_ERR_RTOS_RESOURCE", unless the platform API is blocking.
*/
palStatus_t pal_plat_osTimerCreate(palTimerFuncPtr function, void* funcArgument, palTimerType_t timerType, palTimerID_t* timerID);

/*! Start or restart a timer.
*
* @param[in] timerID The handle for the timer to start.
* @param[in] millisec The time in milliseconds to set the timer to.
*
* \return The status in the form of palStatus_t; PAL_SUCCESS(0) in case of success, a negative value indicating a specific error code in case of failure.
*/
palStatus_t pal_plat_osTimerStart(palTimerID_t timerID, uint32_t millisec);

/*! Stop a timer.
*
* @param[in] timerID The handle for the timer to stop.
*
* \return The status in the form of palStatus_t; PAL_SUCCESS(0) in case of success, a negative value indicating a specific error code in case of failure.
*/
palStatus_t pal_plat_osTimerStop(palTimerID_t timerID);

/*! Delete the timer object
*
* @param[inout] timerID The handle for the timer to delete. In success, *timerID = NULL.
*
* \return PAL_SUCCESS when the timer was deleted successfully, PAL_ERR_RTOS_PARAMETER when the timerID is incorrect.
*/
palStatus_t pal_plat_osTimerDelete(palTimerID_t* timerID);

/*! Create and initialize a mutex object.
*
* @param[out] mutexID The created mutex ID handle, zero value indicates an error.
*
* \return PAL_SUCCESS when the mutex was created successfully, a specific error in case of failure.
*         PAL_ERR_NO_MEMORY: no memory resource available to create mutex object.
* \note the create function MUST not wait for platform resources and it should return "PAL_ERR_RTOS_RESOURCE", unless the platform API is blocking.
*/
palStatus_t pal_plat_osMutexCreate(palMutexID_t* mutexID);

/*! Wait until a mutex becomes available.
*
* @param[in] mutexID The handle for the mutex.
* @param[in] millisec The timeout for the waiting operation if the timeout expires before the semaphore is released and an error is returned from the function.
*
* \return The status in the form of palStatus_t; PAL_SUCCESS(0) in case of success, one of the following error codes in case of failure:
*         PAL_ERR_RTOS_RESOURCE - Mutex not available but no timeout set.
*         PAL_ERR_RTOS_TIMEOUT - Mutex was not available until timeout expired.
*         PAL_ERR_RTOS_PARAMETER - Mutex ID is invalid.
*         PAL_ERR_RTOS_ISR - Cannot be called from interrupt service routines.
*/
palStatus_t pal_plat_osMutexWait(palMutexID_t mutexID, uint32_t millisec);

/*! Release a mutex that was obtained by osMutexWait.
*
* @param[in] mutexID The handle for the mutex.
*
* \return The status in the form of palStatus_t; PAL_SUCCESS(0) in case of success, a negative value indicating a specific error code in case of failure.
*/
palStatus_t pal_plat_osMutexRelease(palMutexID_t mutexID);

/*!Delete a mutex object.
*
* @param[inout] mutexID The ID of the mutex to delete. In success, *mutexID = NULL.
*
* \return PAL_SUCCESS when the mutex was deleted successfully, one of the following error codes in case of failure:
*         PAL_ERR_RTOS_RESOURCE - Mutex already released.
*         PAL_ERR_RTOS_PARAMETER - Mutex ID is invalid.
*         PAL_ERR_RTOS_ISR - Cannot be called from interrupt service routines.
* \note After this call, mutex_id is no longer valid and cannot be used.
*/
palStatus_t pal_plat_osMutexDelete(palMutexID_t* mutexID);

/*! Create and initialize a semaphore object.
*
* @param[in] count The number of available resources.
* @param[out] semaphoreID The ID of the created semaphore, zero value indicates an error.
*
* \return PAL_SUCCESS when the semaphore was created successfully, a specific error in case of failure.
*         PAL_ERR_NO_MEMORY: no memory resource available to create semaphore object.
* \note the create function MUST not wait for platform resources and it should return "PAL_ERR_RTOS_RESOURCE", unless the platform API is blocking.
*/
palStatus_t pal_plat_osSemaphoreCreate(uint32_t count, palSemaphoreID_t* semaphoreID);

/*! Wait until a semaphore token becomes available.
*
* @param[in] semaphoreID The handle for the semaphore.
* @param[in] millisec The timeout for the waiting operation if the timeout expires before the semaphore is released and an error is returned from the function.
* @param[out] countersAvailable The number of semaphores available, if semaphores are not available (timeout/error) zero is returned. 
* \return The status in the form of palStatus_t; PAL_SUCCESS(0) in case of success, one of the following error codes in case of failure:
*       PAL_ERR_RTOS_TIMEOUT - Semaphore was not available until timeout expired.
*       PAL_ERR_RTOS_PARAMETER - Semaphore ID is invalid.
*/
palStatus_t pal_plat_osSemaphoreWait(palSemaphoreID_t semaphoreID, uint32_t millisec, int32_t* countersAvailable);

/*! Release a semaphore token.
*
* @param[in] semaphoreID The handle for the semaphore.
*
* \return The status in the form of palStatus_t; PAL_SUCCESS(0) in case of success, a negative value indicating a specific error code in case of failure.
*/
palStatus_t pal_plat_osSemaphoreRelease(palSemaphoreID_t semaphoreID);

/*! Delete a semaphore object.
*
* @param[inout] semaphoreID: The ID of the semaphore to delete. In success, *semaphoreID = NULL.
*
* \return PAL_SUCCESS when the semaphore was deleted successfully, one of the following error codes in case of failure:
*         PAL_ERR_RTOS_RESOURCE - Semaphore already released.
*         PAL_ERR_RTOS_PARAMETER - Semaphore ID is invalid.
* \note After this call, the semaphore_id is no longer valid and cannot be used.
*/
palStatus_t pal_plat_osSemaphoreDelete(palSemaphoreID_t* semaphoreID);

/*! Create and initialize a memory pool.
*
* @param[in] blockSize The size of a single block in bytes.
* @param[in] blockCount The maximum number of blocks in the memory pool.
* @param[out] memoryPoolID The ID of the created memory pool, zero value indicates an error.
*
* \return PAL_SUCCESS when the memory pool was created successfully, a specific error in case of failure.
*         PAL_ERR_NO_MEMORY: no memory resource available to create memory pool object.
* \note the create function MUST not wait for platform resources and it should return "PAL_ERR_RTOS_RESOURCE", unless the platform API is blocking.
*/
palStatus_t pal_plat_osPoolCreate(uint32_t blockSize, uint32_t blockCount, palMemoryPoolID_t* memoryPoolID);

/*! Allocate a single memory block from a memory pool.
*
* @param[in] memoryPoolID The handle for the memory pool.
*
* \return A pointer to a single allocated memory from the pool, NULL in case of failure.
*/
void* pal_plat_osPoolAlloc(palMemoryPoolID_t memoryPoolID);

/*! Allocate a single memory block from a memory pool and set memory block to zero.
*
* @param[in] memoryPoolID The handle for the memory pool.
*
* \return A pointer to a single allocated memory from the pool, NULL in case of failure.
*/
void* pal_plat_osPoolCAlloc(palMemoryPoolID_t memoryPoolID);

/*! Return the memoryPoolID of the memory block back to a specific memory pool.
*
* @param[in] memoryPoolID The handle for the memory pool.
* @param[in] block The block to be freed.
*
* \return The status in the form of palStatus_t; PAL_SUCCESS(0) in case of success, a negative value indicating a specific error code in case of failure.
*/
palStatus_t pal_plat_osPoolFree(palMemoryPoolID_t memoryPoolID, void* block);

/*! Delete a memory pool object.
*
* @param[inout] memoryPoolID The handle for the memory pool. In success, *memoryPoolID = NULL.
*
* \return The status in the form of palStatus_t; PAL_SUCCESS(0) in case of success, a negative value indicating a specific error code in case of failure.
*/
palStatus_t pal_plat_osPoolDestroy(palMemoryPoolID_t* memoryPoolID);

/*! Create and initialize a message queue.
*
* @param[in] messageQSize The size of the message queue.
* @param[out] messageQID The ID of the created message queue, zero value indicates an error.
*
* \return PAL_SUCCESS when the message queue was created successfully, a specific error in case of failure.
*         PAL_ERR_NO_MEMORY: no memory resource available to create message queue object.
* \note the create function MUST not wait for platform resources and it should return "PAL_ERR_RTOS_RESOURCE", unless the platform API is blocking.
*/
palStatus_t pal_plat_osMessageQueueCreate(uint32_t messageQSize, palMessageQID_t* messageQID);

/*! Put a message to a queue.
*
* @param[in] messageQID The handle for the message queue.
* @param[in] info The data to send.
* @param[in] timeout The timeout in milliseconds.
*
* \return The status in the form of palStatus_t; PAL_SUCCESS(0) in case of success, a negative value indicating a specific error code in case of failure.
*/
palStatus_t pal_plat_osMessagePut(palMessageQID_t messageQID, uint32_t info, uint32_t timeout);

/*! Get a message or wait for a message from a queue.
*
* @param[in] messageQID The handle for the message queue.
* @param[in] timeout The timeout in milliseconds.
* @param[out] messageValue The data to send.
*
* \return The status in the form of palStatus_t; PAL_SUCCESS(0) in case of success, one of the following error codes in case of failure:
* PAL_ERR_RTOS_RESOURCE - Semaphore was not available but not due to timeout.
* PAL_ERR_RTOS_TIMEOUT -  No message arrived during the timeout period.
* PAL_ERR_RTOS_RESOURCE -  No message received and there was no timeout.
*/
palStatus_t pal_plat_osMessageGet(palMessageQID_t messageQID, uint32_t timeout, uint32_t* messageValue);

/*! Delete a message queue object.
*
* @param[inout] messageQID The handle for the message queue. In success, *messageQID = NULL.
*
* \return The status in the form of palStatus_t; PAL_SUCCESS(0) in case of success, a negative value indicating a specific error code in case of failure.
*/
palStatus_t pal_plat_osMessageQueueDestroy(palMessageQID_t* messageQID);

/*! Perform an atomic increment for a signed32 bit value.
*
* @param[in,out] valuePtr The address of the value to increment.
* @param[in] increment The number by which to increment.
*
* \returns The value of the valuePtr after the increment operation.
*/
int32_t pal_plat_osAtomicIncrement(int32_t* valuePtr, int32_t increment);

#ifdef DEBUG
#include "stdio.h"
#define pal_plat_printf(ARGS...) printf(ARGS)
#define pal_plat_vprintf(FORMAT,LIST) vprintf(FORMAT,LIST)  

#endif
#ifdef __cplusplus
}
#endif
#endif //_PAL_COMMON_H
