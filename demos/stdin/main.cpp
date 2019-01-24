#include "mbed.h"

Serial pc(USBTX, USBRX); // tx, rx
PwmOut led(p5);

float brightness = 0.5f;

int main() {
    printf("Keyboard input is mapped to stdin\n");
    printf("Click on the serial output panel, then:\n");
    printf("press 'u' to turn LED1 brightness up, 'd' to turn it down\n");

    led = brightness;

    while(1) {
        char c = pc.getc();

        switch (c) {
            case 'u':
                if (brightness <= 0.9f) brightness += 0.1f;
                led = brightness;
                pc.printf("Up, brightness is %0.1f\n", brightness);
                break;
            case 'd':
                if (brightness >= 0.1f) brightness -= 0.1f;
                led = brightness;
                pc.printf("Down, brightness is %0.1f\n", brightness);
                break;
            default:
                pc.printf("Unrecognized input '%c'\n", c);
                break;
        }
    }
}
