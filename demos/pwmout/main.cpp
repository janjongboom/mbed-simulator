#include "mbed.h"

PwmOut led(p5);

int main() {
    while(1) {
        led = led + 0.10;
        printf("LED is now %.2f\n", led.read());
        wait(0.2);

        if(led == 1.0) {
            led = 0;
        }
    }
}