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

#include "pal_types.h"
#include "pal_rtos.h"
#include "pal_plat_rtos.h"
#include "pal_errors.h"
#include "stdlib.h"
#include "string.h"

#include "cmsis_os.h" // Revision:    V1.02
// These includes try to find declaration of NVIC_SystemReset.
// Note: At least on A9 the cmsis_nvic.h can not be included without previous
// board specific includes, so it has to be included only when known to work.
#if defined (__CORTEX_M0)
#include "cmsis_nvic.h"
#include "core_cm0.h"
#elif defined (__CORTEX_M3)
#include "cmsis_nvic.h"
#include "core_cm3.h"
#elif defined (__CORTEX_M4)
#include "cmsis_nvic.h"
#include "core_cm4.h"
#elif defined (__CORTEX_M7)
#include "cmsis_nvic.h"
#include "core_cm7.h"
#else
// Declaration of NVIC_SystemReset is not present on core_ca9.h, but in the
// board specific files. 
void NVIC_SystemReset(void);
#endif

#include "critical.h"

#define PAL_RTOS_TRANSLATE_CMSIS_ERROR_CODE(cmsisCode)\
    ((int32_t)(cmsisCode + PAL_ERR_RTOS_ERROR_BASE))

//! the size of the memory to allocate was taken from CMSIS header (cmsis_os.h)
#define PAL_RTOS_MEMORY_POOL_SIZE(blockSize, blockCount)\
    (sizeof(uint32_t)*(3+((blockSize+3)/4)*(blockCount)))

//! the size of the memory to allocate was taken from CMSIS header (cmsis_os.h)
#define PAL_RTOS_MESSAGE_Q_SIZE(messageQSize)\
    (sizeof(uint32_t)*(4 + messageQSize))


#ifdef PAL_RTOS_WAIT_FOREVER
#undef PAL_RTOS_WAIT_FOREVER
#define PAL_RTOS_WAIT_FOREVER osWaitForever
#endif //PAL_RTOS_WAIT_FOREVER

//! This definitions should be under #ifdef for different CORTEX-X processors.
//! The current vaules are for cortex-M these are the sizes of the internal data array in definitions arrays
#define PAL_TIMER_DATA_SIZE 6
#define PAL_MUTEX_DATA_SIZE 4
#define PAL_SEMAPHORE_DATA_SIZE 2
#define PAL_NUM_OF_THREAD_INSTANCES 1
#define PAL_TICK_TO_MILLI_FACTOR 1000

typedef struct palThreadFuncWrapper{
    palTimerFuncPtr         realThreadFunc;
    void*                   realThreadArgs;
    uint32_t                threadIndex;
}palThreadFuncWrapper_t;

//! Thread structure
typedef struct palThread{
    palThreadID_t           threadID;
    bool                    initialized;
    palThreadLocalStore_t*  threadStore; //! please see pal_rtos.h for documentation
    palThreadFuncWrapper_t  threadFuncWrapper;
    osThreadDef_t           osThread;
} palThread_t;

static palThread_t g_palThreads[PAL_MAX_NUMBER_OF_THREADS] = {0};

//! Timer structure
typedef struct palTimer{
    palTimerID_t            timerID;
    uint32_t                internalTimerData[PAL_TIMER_DATA_SIZE];  ///< pointer to internal data
    osTimerDef_t            osTimer;
} palTimer_t;

//! Mutex structure
typedef struct palMutex{
    palMutexID_t            mutexID;
    uint32_t                internalMutexData[PAL_MUTEX_DATA_SIZE];
    osMutexDef_t            osMutex;
}palMutex_t;

//! Semaphore structure
typedef struct palSemaphore{
    palSemaphoreID_t        semaphoreID;
    uint32_t                internalSemaphoreData[PAL_SEMAPHORE_DATA_SIZE];
    osSemaphoreDef_t        osSemaphore;
}palSemaphore_t;


//! Memoey Pool structure
typedef struct palMemPool{
    palMemoryPoolID_t       memoryPoolID;
    osPoolDef_t             osPool;
}palMemoryPool_t;

//! Message Queue structure
typedef struct palMessageQ{
    palMessageQID_t         messageQID;
    osMessageQDef_t         osMessageQ;
}palMessageQ_t;


inline static void setDefaultThreadValues(palThread_t* thread)
{
#if PAL_UNIQUE_THREAD_PRIORITY      
    g_palThreadPriorities[thread->osThread.tpriority+PRIORYT_INDEX_OFFSET] = false;
#endif //PAL_UNIQUE_THREAD_PRIORITY     
    thread->threadStore = NULL;
    thread->threadFuncWrapper.realThreadArgs = NULL;
    thread->threadFuncWrapper.realThreadFunc = NULL;
    thread->threadFuncWrapper.threadIndex = 0;
    thread->osThread.pthread = NULL;
    thread->osThread.tpriority = PAL_osPriorityError;
    thread->osThread.instances = PAL_NUM_OF_THREAD_INSTANCES;
    thread->osThread.stacksize = 0;
    thread->osThread.stack_pointer = NULL;
    //! This line should be last thing to be done in this function.
    //! in order to prevent double accessing the same index between
    //! this function and the threadCreate function.
    thread->initialized = false;
}

/*! Clean thread data from the global thread data base (g_palThreads). Thread Safe API
*
* @param[in] dbPointer: data base pointer.
* @param[in] index: the index in the data base to be cleaned.
*/
static void threadCleanUp(void* dbPointer, uint32_t index)
{
    palThread_t* threadsDB = (palThread_t*)dbPointer;

    if (NULL == dbPointer || index >= PAL_MAX_NUMBER_OF_THREADS)
    {
        return;
    }

    setDefaultThreadValues(&threadsDB[index]);

}

/*! Thread wrapper function, this function will be set as the thread function (for every thread)
*   and it will get as an argument the real data about the thread and call the REAL thread function
*   with the REAL argument. Once the REAL thread function finished, \ref pal_threadClean() will be called.
*
*   @param[in] arg: data structure which contains the real data about the thread.
*/
static void threadFunctionWrapper(void const* arg)
{
    palThreadFuncWrapper_t* threadWrapper = (palThreadFuncWrapper_t*)arg;
    if (NULL != threadWrapper)
    {
        threadWrapper->realThreadFunc(threadWrapper->realThreadArgs);
        //! real thread finished to run, now start the cleanup from the data base.
        threadCleanUp(g_palThreads, threadWrapper->threadIndex);
    }
}


void pal_plat_osReboot()
{
    NVIC_SystemReset();
}

palStatus_t pal_plat_RTOSInitialize(void* opaqueContext)
{
    palStatus_t status = PAL_SUCCESS;
    static bool palRTOSInitialized = false;
    if (palRTOSInitialized)
    {
        return PAL_SUCCESS;
    }
    for (int i = 0; i < PAL_MAX_NUMBER_OF_THREADS; ++i)
    {
        g_palThreads[i].initialized = false;
    }

    if (PAL_SUCCESS == status)
    {
        palRTOSInitialized = true;
    }
    return status;
}

void pal_plat_RTOSDestroy(void)
{
    for (int i = 0; i < PAL_MAX_NUMBER_OF_THREADS; ++i)
    {
        if (true == g_palThreads[i].initialized)
        {
            osThreadTerminate((osThreadId)g_palThreads[i].threadID);
            threadCleanUp(g_palThreads, i);
        }
    }
    return;
}
palStatus_t pal_plat_osDelay(uint32_t milliseconds)
{
    palStatus_t status;
    osStatus platStatus = osDelay(milliseconds);
    if (osEventTimeout == platStatus)
    {
        status = PAL_SUCCESS;
    }
    else
    {
        status = PAL_RTOS_TRANSLATE_CMSIS_ERROR_CODE(platStatus); //TODO(nirson01): error propagation MACRO??
    }
    return status;
}

uint32_t pal_plat_osKernelSysTick()
{
    uint32_t result;
    result = osKernelSysTick();
    return result;
}

uint64_t pal_plat_osKernelSysTickMicroSec(uint64_t microseconds)
{
    uint64_t result;
    result = osKernelSysTickMicroSec(microseconds);
    return result;
}

uint64_t pal_plat_osKernelSysMilliSecTick(uint64_t sysTicks)
{
    uint64_t millisec = (PAL_TICK_TO_MILLI_FACTOR * sysTicks)/osKernelSysTickFrequency;
    return millisec;
}

uint64_t pal_plat_osKernelSysTickFrequency()
{
    return osKernelSysTickFrequency;
}

palStatus_t pal_plat_osThreadCreate(palThreadFuncPtr function, void* funcArgument, palThreadPriority_t priority, uint32_t stackSize, uint32_t* stackPtr, palThreadLocalStore_t* store, palThreadID_t* threadID)
{
    palStatus_t status = PAL_SUCCESS;
    uint32_t firstAvailableThreadIndex = PAL_MAX_NUMBER_OF_THREADS;
    uint32_t i;

    if (NULL == threadID || NULL == function || NULL == stackPtr || 0 == stackSize || priority > PAL_osPriorityRealtime)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    for (i = 0; i < PAL_MAX_NUMBER_OF_THREADS; ++i)
    {
        if (!g_palThreads[i].initialized)
        {
            firstAvailableThreadIndex = i;
            break;
        }
    }

    if (firstAvailableThreadIndex >= PAL_MAX_NUMBER_OF_THREADS)
    {
        status = PAL_ERR_RTOS_RESOURCE;
    }

    if (PAL_SUCCESS == status)
    {
        g_palThreads[firstAvailableThreadIndex].threadStore = store;
        g_palThreads[firstAvailableThreadIndex].threadFuncWrapper.realThreadArgs = funcArgument;
        g_palThreads[firstAvailableThreadIndex].threadFuncWrapper.realThreadFunc = function;
        g_palThreads[firstAvailableThreadIndex].threadFuncWrapper.threadIndex = firstAvailableThreadIndex;
        g_palThreads[firstAvailableThreadIndex].osThread.pthread = threadFunctionWrapper;
        g_palThreads[firstAvailableThreadIndex].osThread.tpriority = priority;
        g_palThreads[firstAvailableThreadIndex].osThread.instances = PAL_NUM_OF_THREAD_INSTANCES;
        g_palThreads[firstAvailableThreadIndex].osThread.stacksize = stackSize;
        g_palThreads[firstAvailableThreadIndex].osThread.stack_pointer = stackPtr;
        g_palThreads[firstAvailableThreadIndex].initialized = true;
#if PAL_UNIQUE_THREAD_PRIORITY      
        g_palThreadPriorities[priority+PRIORYT_INDEX_OFFSET] = true;
#endif //PAL_UNIQUE_THREAD_PRIORITY     

        status = PAL_SUCCESS;
    
        g_palThreads[firstAvailableThreadIndex].threadID = (uintptr_t)osThreadCreate(&g_palThreads[firstAvailableThreadIndex].osThread, &g_palThreads[firstAvailableThreadIndex].threadFuncWrapper);
        *threadID = g_palThreads[firstAvailableThreadIndex].threadID;
        
        if(NULLPTR == *threadID)
        {
            //! in case of error in the thread creation, reset the data of the given index in the threads array.
            threadCleanUp(g_palThreads, firstAvailableThreadIndex);
        
            status = PAL_ERR_GENERIC_FAILURE;
        }
    }
    return status;
}

palThreadID_t pal_plat_osThreadGetId()
{
    palThreadID_t result;
    result = (uintptr_t)osThreadGetId();
    return result;
}

palStatus_t pal_plat_osThreadTerminate(palThreadID_t* threadID)
{
    palStatus_t status = PAL_SUCCESS;
    osStatus platStatus = osOK;

    if (NULL == threadID || NULLPTR == *threadID)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    for (int i = 0; i < PAL_MAX_NUMBER_OF_THREADS; ++i)
    {
        if (g_palThreads[i].initialized && (*threadID == g_palThreads[i].threadID))
        {
            platStatus = osThreadTerminate((osThreadId)(*threadID));
            if (osOK == platStatus)
            {
                threadCleanUp(g_palThreads, i);
                *threadID = NULLPTR;
            }
            else
            {
                status = PAL_RTOS_TRANSLATE_CMSIS_ERROR_CODE(platStatus);
            }
            break;

        }
        else if (!g_palThreads[i].initialized && (*threadID == g_palThreads[i].threadID))
        {
            *threadID = NULLPTR;
        }
    }
    return status;
}

void* pal_plat_osThreadGetLocalStore()
{
    void* localStore = NULL;
    palThreadID_t id = (uintptr_t)osThreadGetId();

    for(int i = 0; i < PAL_MAX_NUMBER_OF_THREADS; ++i)
    {
        if(g_palThreads[i].initialized && (id == g_palThreads[i].threadID))
        {
            localStore = g_palThreads[i].threadStore;
            break;
        }
    }
    return localStore;
}


palStatus_t pal_plat_osTimerCreate(palTimerFuncPtr function, void* funcArgument, palTimerType_t timerType, palTimerID_t* timerID)
{
    palStatus_t status = PAL_SUCCESS;
    palTimer_t* timer = NULL;

    if(NULL == timerID || NULL == function)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    timer = (palTimer_t*)malloc(sizeof(palTimer_t));
    if (NULL == timer)
    {
        status = PAL_ERR_NO_MEMORY;
    }

    if (PAL_SUCCESS == status)
    {
        timer->osTimer.ptimer = function;
        timer->osTimer.timer = timer->internalTimerData;
        memset(timer->osTimer.timer, 0, sizeof(uint32_t)*PAL_TIMER_DATA_SIZE);
    
        timer->timerID = (uintptr_t)osTimerCreate(&timer->osTimer, timerType, funcArgument);
        if (NULLPTR == timer->timerID)
        {
            free(timer);
            timer = NULL;
            status = PAL_ERR_GENERIC_FAILURE;
        }
        else
        {
            *timerID = (palTimerID_t)timer;
        }
    }
    return status;
}

palStatus_t pal_plat_osTimerStart(palTimerID_t timerID, uint32_t millisec)
{
    palStatus_t status = PAL_SUCCESS;
    osStatus platStatus = osOK;
    palTimer_t* timer = NULL;
    
    if (NULLPTR == timerID)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    timer = (palTimer_t*)timerID;
    platStatus = osTimerStart((osTimerId)timer->timerID, millisec);
    if (osOK == (osStatus)platStatus)
    {
        status = PAL_SUCCESS;
    }
    else
    {
        status = PAL_RTOS_TRANSLATE_CMSIS_ERROR_CODE(platStatus);
    }

    return status;
}

palStatus_t pal_plat_osTimerStop(palTimerID_t timerID)
{
    palStatus_t status = PAL_SUCCESS;
    osStatus platStatus = osOK;
    palTimer_t* timer = NULL;
    
    if(NULLPTR == timerID)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    timer = (palTimer_t*)timerID;
    platStatus = osTimerStop((osTimerId)timer->timerID);
    if (osOK == platStatus)
    {
        status = PAL_SUCCESS;
    }
    else
    {
        status = PAL_RTOS_TRANSLATE_CMSIS_ERROR_CODE(platStatus);
    }

    return status;  
}

palStatus_t pal_plat_osTimerDelete(palTimerID_t* timerID)
{
    palStatus_t status = PAL_SUCCESS;
    osStatus platStatus = osOK;
    palTimer_t* timer = NULL;
    
    if(NULL == timerID || NULLPTR == *timerID)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    timer = (palTimer_t*)*timerID;
    platStatus = osTimerDelete((osTimerId)timer->timerID);
    if (osOK == platStatus)
    {
        free(timer);
        *timerID = NULLPTR;
        status = PAL_SUCCESS;
    }
    else
    {
        status = PAL_RTOS_TRANSLATE_CMSIS_ERROR_CODE(platStatus);
    }

    return status;
}


palStatus_t pal_plat_osMutexCreate(palMutexID_t* mutexID)
{
    palStatus_t status = PAL_SUCCESS;
    palMutex_t* mutex = NULL;
    if(NULL == mutexID)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    mutex = (palMutex_t*)malloc(sizeof(palMutex_t));
    if (NULL == mutex)
    {
        status = PAL_ERR_NO_MEMORY;
    }

    if (PAL_SUCCESS == status)
    {
        mutex->osMutex.mutex = mutex->internalMutexData;
        memset(mutex->osMutex.mutex, 0, sizeof(uint32_t)*PAL_MUTEX_DATA_SIZE);
    
        mutex->mutexID = (uintptr_t)osMutexCreate(&mutex->osMutex);
        if (NULLPTR == mutex->mutexID)
        {
            free(mutex);
            mutex = NULL;
            status = PAL_ERR_GENERIC_FAILURE;
        }
        else
        {
            *mutexID = (palMutexID_t)mutex;
        }
    }
    return status;
}


palStatus_t pal_plat_osMutexWait(palMutexID_t mutexID, uint32_t millisec)
{
    palStatus_t status = PAL_SUCCESS;
    osStatus platStatus = osOK;
    palMutex_t* mutex = NULL;
    
    if(NULLPTR == mutexID)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    mutex = (palMutex_t*)mutexID;
    platStatus = osMutexWait((osMutexId)mutex->mutexID, millisec);
    if (osOK == platStatus)
    {
        status = PAL_SUCCESS;
    }
    else
    {
        status = PAL_RTOS_TRANSLATE_CMSIS_ERROR_CODE(platStatus);
    }

    return status;
}


palStatus_t pal_plat_osMutexRelease(palMutexID_t mutexID)
{
    palStatus_t status = PAL_SUCCESS;
    osStatus platStatus = osOK;
    palMutex_t* mutex = NULL;
    
    if(NULLPTR == mutexID)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    mutex = (palMutex_t*)mutexID;
    platStatus = osMutexRelease((osMutexId)mutex->mutexID);
    if (osOK == platStatus)
    {
        status = PAL_SUCCESS;
    }
    else
    {
        status = PAL_RTOS_TRANSLATE_CMSIS_ERROR_CODE(platStatus);
    }

    return status;
}

palStatus_t pal_plat_osMutexDelete(palMutexID_t* mutexID)
{
    palStatus_t status = PAL_SUCCESS;
    osStatus platStatus = osOK;
    palMutex_t* mutex = NULL;
    
    if(NULL == mutexID || NULLPTR == *mutexID)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    mutex = (palMutex_t*)*mutexID;
    platStatus = osMutexDelete((osMutexId)mutex->mutexID);
    if (osOK == platStatus)
    {
        free(mutex);
        *mutexID = NULLPTR;
        status = PAL_SUCCESS;
    }
    else
    {
        status = PAL_RTOS_TRANSLATE_CMSIS_ERROR_CODE(platStatus);
    }

    return status;
}

palStatus_t pal_plat_osSemaphoreCreate(uint32_t count, palSemaphoreID_t* semaphoreID)
{
    palStatus_t status = PAL_SUCCESS;
    palSemaphore_t* semaphore = NULL;
    if(NULL == semaphoreID)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    semaphore = (palSemaphore_t*)malloc(sizeof(palSemaphore_t));
    if (NULL == semaphore)
    {
        status = PAL_ERR_NO_MEMORY;
    }

    if(PAL_SUCCESS == status)
    {
        semaphore->osSemaphore.semaphore = semaphore->internalSemaphoreData;
        memset(semaphore->osSemaphore.semaphore, 0, sizeof(uint32_t)*PAL_SEMAPHORE_DATA_SIZE);
    
        semaphore->semaphoreID = (uintptr_t)osSemaphoreCreate(&semaphore->osSemaphore, count);
        if (NULLPTR == semaphore->semaphoreID)
        {
            free(semaphore);
            semaphore = NULL;
            status = PAL_ERR_GENERIC_FAILURE;
        }
        else
        {
            *semaphoreID = (palSemaphoreID_t)semaphore;
        }
    }
    return status;  
}

palStatus_t pal_plat_osSemaphoreWait(palSemaphoreID_t semaphoreID, uint32_t millisec, int32_t* countersAvailable)
{
    palStatus_t status = PAL_SUCCESS;
    palSemaphore_t* semaphore = NULL;
    if(NULLPTR == semaphoreID || NULL == countersAvailable)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }   

    semaphore = (palSemaphore_t*)semaphoreID;
    *countersAvailable = osSemaphoreWait((osSemaphoreId)semaphore->semaphoreID, millisec);
    if (0 == *countersAvailable)
    {
        status = PAL_ERR_RTOS_TIMEOUT;
    }
    else if (*countersAvailable < 0)
    {
        *countersAvailable = 0;
        status = PAL_ERR_RTOS_PARAMETER;
    }
    return status;
}

palStatus_t pal_plat_osSemaphoreRelease(palSemaphoreID_t semaphoreID)
{
    palStatus_t status = PAL_SUCCESS;
    osStatus platStatus = osOK;
    palSemaphore_t* semaphore = NULL;
    
    if(NULLPTR == semaphoreID)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    semaphore = (palSemaphore_t*)semaphoreID;
    platStatus = osSemaphoreRelease((osSemaphoreId)semaphore->semaphoreID);
    if (osOK == platStatus)
    {
        status = PAL_SUCCESS;
    }
    else
    {
        status = PAL_RTOS_TRANSLATE_CMSIS_ERROR_CODE(platStatus);
    }

    return status;
}

palStatus_t pal_plat_osSemaphoreDelete(palSemaphoreID_t* semaphoreID)
{
    palStatus_t status = PAL_SUCCESS;
    osStatus platStatus = osOK;
    palSemaphore_t* semaphore = NULL;
    
    if(NULL == semaphoreID || NULLPTR == *semaphoreID)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    semaphore = (palSemaphore_t*)*semaphoreID;
    platStatus = osSemaphoreDelete((osSemaphoreId)semaphore->semaphoreID);
    if (osOK == platStatus)
    {
        free(semaphore);
        *semaphoreID = NULLPTR;
        status = PAL_SUCCESS;
    }
    else
    {
        status = PAL_RTOS_TRANSLATE_CMSIS_ERROR_CODE(platStatus);
    }

    return status;  
}

palStatus_t pal_plat_osPoolCreate(uint32_t blockSize, uint32_t blockCount, palMemoryPoolID_t* memoryPoolID)
{
    palStatus_t status = PAL_SUCCESS;
    palMemoryPool_t* memoryPool = NULL;
    if(NULL == memoryPoolID)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    //! allocate the memory pool structure
    memoryPool = (palMemoryPool_t*)malloc(sizeof(palMemoryPool_t));
    if (NULL == memoryPool)
    {
        status = PAL_ERR_NO_MEMORY;
    }

    if(PAL_SUCCESS == status)
    {
        //! allocate the actual memory allocation for the memory pool blocks, the size of the memory 
        //! to allocate was taken from CMSIS header (cmsis_os.h)
        memoryPool->osPool.pool = (uint32_t*)malloc(PAL_RTOS_MEMORY_POOL_SIZE(blockSize, blockCount));
        if (NULL == memoryPool->osPool.pool)
        {
            free(memoryPool);
            *memoryPoolID = NULLPTR;
            status = PAL_ERR_NO_MEMORY;
        }
        else
        {
            memset(memoryPool->osPool.pool, 0, PAL_RTOS_MEMORY_POOL_SIZE(blockSize, blockCount));
            memoryPool->osPool.pool_sz = blockCount;    ///< number of items (elements) in the pool
            memoryPool->osPool.item_sz = blockSize;     ///< size of an item
        
            memoryPool->memoryPoolID = (uintptr_t)osPoolCreate(&memoryPool->osPool);
            if (NULLPTR == memoryPool->memoryPoolID)
            {
                free(memoryPool->osPool.pool);
                free(memoryPool);
                memoryPool = NULL;
                status = PAL_ERR_GENERIC_FAILURE;
            }
            else
            {
                *memoryPoolID = (palMemoryPoolID_t)memoryPool;
            }
        }
    }
    return status;      
}

void* pal_plat_osPoolAlloc(palMemoryPoolID_t memoryPoolID)
{
    void* result = NULL;
    palMemoryPool_t* memoryPool = NULL;
    
    if(NULLPTR == memoryPoolID)
    {
        return NULL;
    }

    memoryPool = (palMemoryPool_t*)memoryPoolID;
    result = osPoolAlloc((osPoolId)memoryPool->memoryPoolID);

    return result;
}

void* pal_plat_osPoolCAlloc(palMemoryPoolID_t memoryPoolID)
{
    void* result = NULL;
    palMemoryPool_t* memoryPool = NULL;
    
    if(NULLPTR == memoryPoolID)
    {
        return NULL;
    }

    memoryPool = (palMemoryPool_t*)memoryPoolID;
    result = osPoolCAlloc((osPoolId)memoryPool->memoryPoolID);

    return result;  
}

palStatus_t pal_plat_osPoolFree(palMemoryPoolID_t memoryPoolID, void* block)
{
    palStatus_t status = PAL_SUCCESS;
    osStatus platStatus = osOK;
    palMemoryPool_t* memoryPool = NULL;
    
    if(NULLPTR == memoryPoolID || NULL == block)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    memoryPool = (palMemoryPool_t*)memoryPoolID;
    platStatus = osPoolFree((osPoolId)memoryPool->memoryPoolID, block);
    if (osOK == platStatus)
    {
        status = PAL_SUCCESS;
    }
    else
    {
        status = PAL_RTOS_TRANSLATE_CMSIS_ERROR_CODE(platStatus);
    }

    return status;  
}

palStatus_t pal_plat_osPoolDestroy(palMemoryPoolID_t* memoryPoolID)
{
    palStatus_t status = PAL_SUCCESS;
    palMemoryPool_t* memoryPool = NULL;
    
    if(NULL == memoryPoolID || NULLPTR == *memoryPoolID)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }   

    memoryPool = (palMemoryPool_t*)*memoryPoolID;
    free(memoryPool->osPool.pool);
    free(memoryPool);
    *memoryPoolID = NULLPTR;
    return status;
}

palStatus_t pal_plat_osMessageQueueCreate(uint32_t messageQSize, palMessageQID_t* messageQID)
{
    palStatus_t status = PAL_SUCCESS;
    palMessageQ_t* messageQ = NULL;
    if(NULL == messageQID)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    //! allocate the message queue structure
    messageQ = (palMessageQ_t*)malloc(sizeof(palMessageQ_t));
    if (NULL == messageQ)
    {
        status = PAL_ERR_NO_MEMORY;
    }

    if (PAL_SUCCESS == status)
    {
        //! allocate the actual memory allocation for the message queue blocks, the size of the memory 
        //! to allocate was taken from CMSIS header (cmsis_os.h)
        messageQ->osMessageQ.pool = (uint32_t*)malloc(PAL_RTOS_MESSAGE_Q_SIZE(messageQSize));
        if (NULL == messageQ->osMessageQ.pool)
        {
            free(messageQ);
            messageQ = NULL;
            status = PAL_ERR_NO_MEMORY;
        }
        else
        {
            memset(messageQ->osMessageQ.pool, 0, PAL_RTOS_MESSAGE_Q_SIZE(messageQSize));
            messageQ->osMessageQ.queue_sz = messageQSize;   ///< number of items (elements) in the queue
        
            messageQ->messageQID = (uintptr_t)osMessageCreate(&(messageQ->osMessageQ), NULL);
            if (NULLPTR == messageQ->messageQID)
            {
                free(messageQ->osMessageQ.pool);
                free(messageQ);
                messageQ = NULL;
                status = PAL_ERR_GENERIC_FAILURE;
            }
            else
            {
                *messageQID = (palMessageQID_t)messageQ;
            }
        }
    }
    return status;      
}

palStatus_t pal_plat_osMessagePut(palMessageQID_t messageQID, uint32_t info, uint32_t timeout)
{
    palStatus_t status = PAL_SUCCESS;
    osStatus platStatus = osOK;
    palMessageQ_t* messageQ = NULL;
    
    if(NULLPTR == messageQID)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    messageQ = (palMessageQ_t*)messageQID;
    platStatus = osMessagePut((osMessageQId)messageQ->messageQID, info, timeout);
    if (osOK == platStatus)
    {
        status = PAL_SUCCESS;
    }
    else
    {
        status = PAL_RTOS_TRANSLATE_CMSIS_ERROR_CODE(platStatus);
    }

    return status;  
}

palStatus_t pal_plat_osMessageGet(palMessageQID_t messageQID, uint32_t timeout, uint32_t* messageValue)
{
    palStatus_t status = PAL_SUCCESS;
    osEvent event;
    palMessageQ_t* messageQ = NULL;

    if (NULLPTR == messageQID)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }

    messageQ = (palMessageQ_t*)messageQID;
    event = osMessageGet((osMessageQId)messageQ->messageQID, timeout);
    
    if ((messageValue != NULL) && (osEventMessage == event.status))
    {
        *messageValue = event.value.v;
        status = PAL_SUCCESS;
    }
    else if (osEventTimeout == event.status)
    {
        status = PAL_ERR_RTOS_TIMEOUT;
    }
    else if (osErrorParameter == event.status)
    {
        status = PAL_ERR_RTOS_PARAMETER;
    }
    else if (osOK == event.status)
    {
        status = PAL_ERR_GENERIC_FAILURE;
    }

    return status;
}


palStatus_t pal_plat_osMessageQueueDestroy(palMessageQID_t* messageQID)
{
    palStatus_t status = PAL_SUCCESS;
    palMessageQ_t* messageQ = NULL;
    
    if(NULL == messageQID || NULLPTR == *messageQID)
    {
        return PAL_ERR_INVALID_ARGUMENT;
    }   

    messageQ = (palMessageQ_t*)*messageQID;
    free(messageQ->osMessageQ.pool);
    free(messageQ);
    *messageQID = NULLPTR;
    return status;
}


int32_t pal_plat_osAtomicIncrement(int32_t* valuePtr, int32_t increment)
{
    if (increment >= 0)
    {
        return core_util_atomic_incr_u32((uint32_t*)valuePtr, increment);
    }
    else
    {
        return core_util_atomic_decr_u32((uint32_t*)valuePtr, 0 - increment);
    }
}
