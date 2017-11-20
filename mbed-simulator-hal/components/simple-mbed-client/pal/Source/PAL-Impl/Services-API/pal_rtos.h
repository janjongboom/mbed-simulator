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


#ifndef _PAL_RTOS_H
#define _PAL_RTOS_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#include "pal_macros.h"
#include "pal_types.h"

//! Wait forever define. used for Semaphores and Mutexes
#define PAL_RTOS_WAIT_FOREVER PAL_MAX_UINT32

//! Primitives IDs types declarations
typedef uintptr_t palThreadID_t;
typedef uintptr_t palTimerID_t;
typedef uintptr_t palMutexID_t;
typedef uintptr_t palSemaphoreID_t;
typedef uintptr_t palMemoryPoolID_t;
typedef uintptr_t palMessageQID_t;

//! Timers types supported in PAL
typedef enum  palTimerType {
    palOsTimerOnce = 0, /*! One shot timer*/
    palOsTimerPeriodic = 1 /*! Periodic (repeating) timer*/
} palTimerType_t;

//! PAL timer function prototype
typedef void(*palTimerFuncPtr)(void const *funcArgument);

//! PAL thread function prototype
typedef void(*palThreadFuncPtr)(void const *funcArgument); 

//! Available priorities in PAL implementation, each priority can appear only once.
typedef enum    pal_osPriority {
    PAL_osPriorityIdle = -3,
    PAL_osPriorityLow = -2,
    PAL_osPriorityBelowNormal = -1,
    PAL_osPriorityNormal = 0,
    PAL_osPriorityAboveNormal = +1,
    PAL_osPriorityHigh = +2,
    PAL_osPriorityRealtime = +3,
    PAL_osPriorityError = 0x84
} palThreadPriority_t; /*! Thread priority levels for PAL threads - each thread must have a different priority*/

//! Thread Local Store struct.
//! Can be used to hold: State, configurations and etc inside the thread.
typedef struct pal_threadLocalStore{
    void* storeData;
} palThreadLocalStore_t;

//------- system general functions
/*! Initiates a system reboot
*/
void pal_osReboot(void);

//------- system tick functions
/*! Get the RTOS kernel system timer counter.
* \note this counter will wrap around very often (e.g. once every 42 sec for 100Mhz)
* \return the RTOS kernel system timer counter
*/
uint32_t pal_osKernelSysTick(void);

/*! Get the RTOS kernel system timer counter.
* \return the RTOS kernel system timer counter
*/
uint64_t pal_osKernelSysTick64(void);

/*! Converts value from microseconds to kernel sys tick
*
* @param[in] microseconds the amount of microseconds to convert into system ticks
*
* \return converted value in system ticks
*/
uint64_t pal_osKernelSysTickMicroSec(uint64_t microseconds);

/*! Converts value from kernel system ticks to milliseconds.
*
* @param[in] sysTicks the amount of kernel system ticks to convert into millieseconds
*
* \return converted value in system ticks
*/
uint64_t pal_osKernelSysMilliSecTick(uint64_t sysTicks);

/*! Get the system tick frequency
* \return the system tick frequency
*/
uint64_t pal_osKernelSysTickFrequency(void);

/*! Creates and starts thread function.
*
* @param[in] function: function pointer to the thread callback function.
* @param[in] funcArgument: argument for the thread function.
* @param[in] priority: priotity of the thread.
* @param[in] stackSize: the stack size of the thread can NOT be 0.
* @param[in] stackPtr: pointer to the thread's stack can NOT be NULL.
* @param[in] store: pointer to thread's local sotre, can be NULL.
* @param[out] threadID: holds the created thread ID handle - zero value indecates an error.
*
* \return PAL_SUCCESS when thread created successfully.
*         PAL_ERR_RTOS_PRIORITY : the given priority already used before in the system.
*
* \note Each thread MUST be with unique priority.
* \note When the priority of the created thread function is higher than the current running thread, the 
*       created thread function starts instantly and becomes the new running thread. 
*/
palStatus_t pal_osThreadCreate(palThreadFuncPtr function, void* funcArgument, palThreadPriority_t priority, uint32_t stackSize, uint32_t* stackPtr, palThreadLocalStore_t* store, palThreadID_t* threadID);


/*! Terminates and free allocated data for the thread.
*
* @param[in] threadID: thread ID to stop and terminate.
*
* \return palStatus_t which will be PAL_SUCCESS(0) in case of success and another negative value indicating a specific error code in case of failure
*         PAL_ERR_RTOS_RESOURCE: if the thread ID is not correct.
*/
palStatus_t pal_osThreadTerminate(palThreadID_t* threadID);

/*! Get ID of the current thread
* \return the ID of the current thread -  in case of error return PAL_MAX_UINT32
* \note for thread with Real Time priority the function will always return PAL_MAX_UINT32
*/
palThreadID_t pal_osThreadGetId(void);

/*! Get the storage of current thread
* \return the storage of the current thread */
void* pal_osThreadGetLocalStore(void);

/*! Wait for a specified time period in milliseconds.
*
* @param[in] milliseconds the amount of milliseconds to wait before proceeding.
*
* \return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS(0) in case of success and another negative value indicating a specific error code in case of failure
*/
palStatus_t pal_osDelay(uint32_t milliseconds);

/*! Creates a Timer.
*
* @param[in] function: function pointer to the timer callback function.
* @param[in] funcArgument: funcArgument for the timer callback function.
* @param[in] timerType: timer type to be created - (periodic or oneShot).
* @param[out] timerID: holds the created timer ID handle - zero value indecates an error.
*
* \return PAL_SUCCESS when timer created successfully.
*         PAL_ERR_NO_MEMORY: no memory resource available to create timer object.
*
* \note the timer function runs according to the platform resources of stack-size and priority.
*/
palStatus_t pal_osTimerCreate(palTimerFuncPtr function, void* funcArgument, palTimerType_t timerType, palTimerID_t* timerID);

/*! Start or restart a timer.
*
* @param[in] timerID the handle for the timer to start
* @param[in] millisec the amount of time in milliseconds to set the timer to.
*
* \return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS(0) in case of success and another negative value indicating a specific error code in case of failure
*/
palStatus_t pal_osTimerStart(palTimerID_t timerID, uint32_t millisec);

/*! Stop a timer.
* @param[in] timerID the handle for the timer to stop
* \return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS(0) in case of success and another negative value indicating a specific error code in case of failure
*/
palStatus_t pal_osTimerStop(palTimerID_t timerID);

/*! Delete the timer object
*
* @param[inout] timerID: the handle for the timer to delete, in success:(*timerID = NULL).
*
* \return PAL_SUCCESS when timer deleted successfully.
*         PAL_ERR_RTOS_PARAMETER when timerID is incorrect.
*/
palStatus_t pal_osTimerDelete(palTimerID_t* timerID);

/*! Create and initialize Mutex object
*
* @param[out] mutexID: holds the created mutex ID handle - zero value indecates an error.
*
* \return PAL_SUCCESS when mutex created successfully.
*         PAL_ERR_NO_MEMORY: no memory resource available to create mutex object.
*/
palStatus_t pal_osMutexCreate(palMutexID_t* mutexID);

/*! Wait until a Mutex becomes available.
*
* @param[in] mutexID the handle for the mutex
* @param[in] millisec the timeout for the waiting operation if the 
             timeout expires before the semaphore is released and 
             error will be returned from the function, PAL_RTOS_WAIT_FOREVER can be used.
*
* \return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS(0) in case of success and one of the following error codes in case of failure:
*         PAL_ERR_RTOS_RESOURCE - mutex not avaialbe but no time out set.
*         PAL_ERR_RTOS_TIMEOUT - mutex was not available until timeout expired.
*         PAL_ERR_RTOS_PARAMETER - mutex id is invalid
*         PAL_ERR_RTOS_ISR - cannot be called from interrupt service routines
*/
palStatus_t pal_osMutexWait(palMutexID_t mutexID, uint32_t millisec);

/*! Release a Mutex that was obtained by osMutexWait.
*
* @param[in] mutexID the handle for the mutex
* \return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS(0) in case of success and another negative value indicating a specific error code in case of failure
*/
palStatus_t pal_osMutexRelease(palMutexID_t mutexID);

/*!Delete a Mutex object.
*
* @param[inout] mutexID: Mutex handle to delete, in success:(*mutexID = NULL).
*
* \return PAL_SUCCESS when mutex deleted successfully.
*         PAL_ERR_RTOS_RESOURCE - mutex already released.
*         PAL_ERR_RTOS_PARAMETER - mutex id is invalid.
*         PAL_ERR_RTOS_ISR - cannot be called from interrupt service routines.
* \note After this call the mutex_id is no longer valid and cannot be used.
*/
palStatus_t pal_osMutexDelete(palMutexID_t* mutexID);

/*! Create and initialize a Semaphore object
*
* @param[in] count: number of available resources
* @param[out] semaphoreID: holds the created semaphore ID handle - zero value indecates an error.
*
* \return PAL_SUCCESS when semaphore created successfully.
*         PAL_ERR_NO_MEMORY: no memory resource available to create semaphore object.
*/
palStatus_t pal_osSemaphoreCreate(uint32_t count, palSemaphoreID_t* semaphoreID);

/*! Wait until a Semaphore token becomes available.
*
* @param[in] semaphoreID the handle for the semaphore
* @param[in] millisec the timeout for the waiting operation if the timeout 
             expires before the semaphore is released and error will be 
             returned from the function, PAL_RTOS_WAIT_FOREVER can be used.
* @param[out] counteresAvailable the number of semaphore available at the call if semaphore is available, if semaphore was not available (timeout/error) zero is returned. 
* \return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS(0) in case of success and one of the following error codes in case of failure:
*       PAL_ERR_RTOS_TIMEOUT - semaphore was not available until timeout expired.
*       PAL_ERR_RTOS_PARAMETER - semaphore id is invalid.
*/
palStatus_t pal_osSemaphoreWait(palSemaphoreID_t semaphoreID, uint32_t millisec, int32_t* countersAvailable);

/*! Release a Semaphore token.
*
* @param[in] semaphoreID the handle for the semaphore
*
* \return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS(0) in case of success and another negative value indicating a specific error code in case of failure
*/
palStatus_t pal_osSemaphoreRelease(palSemaphoreID_t semaphoreID);

/*! Delete a Semaphore object
*
* @param[inout] semaphoreID: Semaphore handle to delete, in success:(*semaphoreID = NULL).
*
* \return PAL_SUCCESS when semaphore deleted successfully.
*         PAL_ERR_RTOS_RESOURCE - semaphore already released.
*         PAL_ERR_RTOS_PARAMETER - semaphore id is invalid.
* \note After this call the semaphore_id is no longer valid and cannot be used.
*/
palStatus_t pal_osSemaphoreDelete(palSemaphoreID_t* semaphoreID);

/*! Create and initialize a memory pool.
*
* @param[in] blockSize: size of single block in bytes.
* @param[in] blockCount: maximum number of blocks in memory pool.
* @param[out] memoryPoolID: holds the created memory pool ID handle - zero value indecates an error.
*
* \return PAL_SUCCESS when memory pool created successfully.
*         PAL_ERR_NO_MEMORY: no memory resource available to create memory pool object.
*/
palStatus_t pal_osPoolCreate(uint32_t blockSize, uint32_t blockCount, palMemoryPoolID_t* memoryPoolID);

/*! Allocate a single memory block from a memory pool.
*
* @param[in] memoryPoolID the handle for the memory pool
*
* \return the function returns a pointer to a single allocated memory from the pool or NULL in case of failure.
*/
void* pal_osPoolAlloc(palMemoryPoolID_t memoryPoolID);

/*! Allocate a single memory block from a memory pool and set memory block to zero.
*
* @param[in] memoryPoolID the handle for the memory pool
*
* \return the function returns a pointer to a single allocated memory from the pool or NULL in case of failure.
*/
void* pal_osPoolCAlloc(palMemoryPoolID_t memoryPoolID);

/*! Return an memoryPoolID memory block back to a specific memory pool.
*
* @param[in] memoryPoolHandle the handle for the memory pool
* @param[in] block the block to free
*
* \return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS(0) in case of success and another negative value indicating a specific error code in case of failure
*/
palStatus_t pal_osPoolFree(palMemoryPoolID_t memoryPoolID, void* block);

/*! Delete a memory pool object.
*
* @param[inout] memoryPoolID the handle for the memory pool, in success:(*memoryPoolID = NULL).
*
* \return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS(0) in case of success and another negative value indicating a specific error code in case of failure
*/
palStatus_t pal_osPoolDestroy(palMemoryPoolID_t* memoryPoolID);


/*! Create and initialize a message queue.
*
* @param[in] messageQSize: size of the message queue.
* @param[out] memoryPoolID: holds the created memory pool ID handle - zero value indecates an error.
*
* \return PAL_SUCCESS when message queue created successfully.
*         PAL_ERR_NO_MEMORY: no memory resource available to create message queue object.
*/
palStatus_t pal_osMessageQueueCreate(uint32_t messageQSize, palMessageQID_t* messageQID);

/*! Put a Message to a Queue.
*
* @param[in] messageQID the handle for the memory pool
* @param[in] info the data to send
* @param[in] timeout timeout in milliseconds
*
* \return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS(0) in case of success and another negative value indicating a specific error code in case of failure
*/
palStatus_t pal_osMessagePut(palMessageQID_t messageQID, uint32_t info, uint32_t timeout);

/*! Get a Message or Wait for a Message from a Queue.
*
* @param[in] messageQID the handle for the memory pool
* @param[in] timeout timeout in milliseconds
* @param[out] event the data to send
*
* \return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS(0) in case of success and one of the following error codes in case of failure:
* PAL_ERR_RTOS_RESOURCE - in case semaphore was not available but not due to time out.
* PAL_ERR_RTOS_TIMEOUT -  no message arrived during the timeout period.
* PAL_ERR_RTOS_RESOURCE -  no message received and there was no timeout
*/
palStatus_t pal_osMessageGet(palMessageQID_t messageQID, uint32_t timeout, uint32_t* messageValue);

/*! Delete a message queue object.
*
* @param[inout] messageQID the handle for the message queue, in success:(*messageQID = NULL).
*
* \return the function returns the status in the form of palStatus_t which will be PAL_SUCCESS(0) in case of success and another negative value indicating a specific error code in case of failure
*/
palStatus_t pal_osMessageQueueDestroy(palMessageQID_t* messageQID);

/*! Perform an atomic increment for a signed32 bit value
*
* @param[in,out] valuePtr the address of the value to increment
* @param[int] increment the amount by which to increment
*
* \returns the function returns the value of the valuePtr after the increment operation.
*/
int32_t pal_osAtomicIncrement(int32_t* valuePtr, int32_t increment);




/*! Printf like function with prefix of function and line.
*
* @param[in] function name of the current function
* @param[in] line line number to be printed
* @param[in] format print format (just like printf)
*
* \returns the function returns the value of the valuePtr after the increment operation.
*/
void dbgPrintf( const char* function, uint32_t line, const char * format, ... );

#define PAL_PRINTF( ARGS...) \
        dbgPrintf(__FUNCTION__,__LINE__, ARGS);





#ifdef __cplusplus
}
#endif
#endif //_PAL_RTOS_H
