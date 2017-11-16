#include "mbed.h"

DigitalOut led1(LED1);
DigitalOut led2(LED2);

void blink_led1() {
    led1 = !led1;
}

Ticker t;
int main() {
    t.attach(callback(&blink_led1), 1.0f);

    wait_ms(osWaitForever);
}
