#include <stddef.h>
#include <time.h>
#include "us_ticker_api.h"

void us_ticker_init(void) {
}

uint32_t us_ticker_read() {
    struct timespec t;
    clock_gettime(CLOCK_REALTIME, &t);

    return (t.tv_sec * 1E9) + t.tv_nsec;
}

void us_ticker_set_interrupt(timestamp_t timestamp) {
}

void us_ticker_fire_interrupt(void)
{
}

void us_ticker_disable_interrupt(void) {
}

void us_ticker_clear_interrupt(void) {
}
