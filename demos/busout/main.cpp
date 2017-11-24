#include "mbed.h"

BusOut myleds(LED1, LED2, LED3, LED4);

int main() {
    while(1) {
        for(int i = 0; i < 16; i++) {
            myleds = i;
            wait(0.25);
        }
    }
}
