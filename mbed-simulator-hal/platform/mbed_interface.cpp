/* mbed Microcontroller Library
 * Copyright (c) 2006-2013 ARM Limited
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
 */
#include <stdio.h>
#include "platform/mbed_interface.h"

#include "platform/mbed_wait_api.h"
#include "platform/mbed_error.h"
#include "platform/mbed_toolchain.h"

#if DEVICE_SEMIHOST

// return true if a debugger is attached, indicating mbed interface is connected
int mbed_interface_connected(void) {
    return true;
}

int mbed_interface_reset(void) {
    printf("mbed_interface_reset\n");
    return 0;
}

WEAK int mbed_interface_uid(char *uid) {
    return -1;
}

int mbed_interface_disconnect(void) {
    return 0;
}

int mbed_interface_powerdown(void) {
    printf("mbed_interface_powerdown\n");
    return 0;
}

// for backward compatibility
void mbed_reset(void) {
    mbed_interface_reset();
}

WEAK int mbed_uid(char *uid) {
    return mbed_interface_uid(uid);
}
#endif

WEAK void mbed_mac_address(char *mac) {
}

void mbed_die() {
    printf("mbed_die not implemented\n");
}

void mbed_error_vfprintf(const char * format, va_list arg) {
    printf("mbed_error_vfprintf not implemented\n");
}
