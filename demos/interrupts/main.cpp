#include "mbed.h"

DigitalOut led1(LED1);
DigitalOut led2(LED2);
DigitalOut led3(LED3);

void blink_led1() {
    led1 = !led1;
}

void toggle_led3() {
    led3 = 1;
}

Ticker t1;
Timeout t2;
int main() {
    t1.attach(callback(&blink_led1), 1.0f);
    t2.attach(callback(&toggle_led3), 2.0f);

    wait_ms(osWaitForever);
}
