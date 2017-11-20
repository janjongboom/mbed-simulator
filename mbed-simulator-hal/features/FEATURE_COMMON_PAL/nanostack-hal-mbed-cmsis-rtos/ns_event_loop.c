/*
 * Copyright (c) 2016 ARM Limited, All Rights Reserved
 */

#include "ns_trace.h"

#include "eventOS_scheduler.h"

#include "ns_event_loop.h"
#include <stdio.h>

#define TRACE_GROUP "evlp"

void eventOS_scheduler_mutex_wait(void)
{
}

void eventOS_scheduler_mutex_release(void)
{
}

uint8_t eventOS_scheduler_mutex_is_owner(void)
{
    return 1; // no rtos here
}

void eventOS_scheduler_signal(void)
{
    printf("eventOS_scheduler_signal\n");
}

void eventOS_scheduler_idle(void)
{
    printf("eventOS_scheduler_idle\n");
}

static void event_loop_thread(const void *arg)
{
    printf("event_loop_thread\n");
}

void ns_event_loop_thread_create(void)
{
    printf("event_loop_thread_create\n");
}

void ns_event_loop_thread_start(void)
{
    printf("event_loop_thread_start\n");
}
