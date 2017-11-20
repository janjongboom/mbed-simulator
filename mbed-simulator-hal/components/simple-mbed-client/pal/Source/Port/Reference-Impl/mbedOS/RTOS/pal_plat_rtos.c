#include "pal_plat_rtos.h"

int32_t pal_plat_osAtomicIncrement(int32_t* valuePtr, int32_t increment) {
    *valuePtr = *valuePtr + 1;
    return *valuePtr;
}

palStatus_t pal_plat_osSemaphoreRelease(palSemaphoreID_t semaphoreID) {
    return PAL_SUCCESS;
}

palStatus_t pal_plat_osSemaphoreCreate(uint32_t count, palSemaphoreID_t* semaphoreID) {
    return PAL_SUCCESS;
}

palStatus_t pal_plat_RTOSInitialize(void* opaqueContext) {
    return PAL_SUCCESS;
}

void pal_plat_RTOSDestroy(void) {

}

palStatus_t pal_plat_osSemaphoreWait(palSemaphoreID_t semaphoreID, uint32_t millisec, int32_t* countersAvailable) {
    return PAL_SUCCESS;
}
