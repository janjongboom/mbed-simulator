/* events
 * Copyright (c) 2017 ARM Limited
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

#include "events/mbed_shared_queues.h"
#include "mbed.h"

using namespace events;

namespace mbed {

/* Only create the EventQueue, but no dispatching thread */
static unsigned char queue_buffer[4096];
static EventQueue queue(4096, queue_buffer);

EventQueue *mbed_event_queue()
{
    return &queue;
}

EventQueue *mbed_highprio_event_queue()
{
    return &queue;
}

}
