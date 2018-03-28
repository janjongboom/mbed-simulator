#include "mbed.h"
#include "mbed_events.h"

// An EventQueue is a very useful construct in Mbed OS, it allows you to schedule events
// and to defer from one context to another (e.g. from ISR to normal thread) without
// writing your own state machines, and while maintaining context.
// https://os.mbed.com/docs/v5.6/tutorials/the-eventqueue-api.html
EventQueue queue;

DigitalOut led1(LED1);
DigitalOut led2(LED2);

InterruptIn btn(BUTTON1);

void blink_led() {
    printf("blink_led invoked\n");
    led1 = !led1;
}

// This does not run in an ISR, so it's safe to use `printf` or other blocking calls
void btn_fall() {
    printf("btn_fall invoked\n");
    led2 = !led2;
}

int main() {
    // Schedule an event to run every second
    queue.call_every(1000, &blink_led);

    // Normally code in the `fall` handler runs in an ISR,
    // but you can directly defer it to the thread that runs the queue
    btn.fall(queue.event(&btn_fall));

    // Because the simulator does not support multiple threads,
    // we have to call dispatch_forever from the main thread.
    // Typically you'd run this on a separate thread within Mbed's RTOS.
    queue.dispatch_forever();
}
