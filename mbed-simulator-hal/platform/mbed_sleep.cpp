#include "mbed_sleep.h"

void sleep_manager_lock_deep_sleep(void) {}
void sleep_manager_unlock_deep_sleep(void) {}
bool sleep_manager_can_deep_sleep(void) {
    return false;
}
void sleep_manager_sleep_auto(void) {}
