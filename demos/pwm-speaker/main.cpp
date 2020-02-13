#include "mbed.h"

PwmOut speaker(p21);

void play_tone(float frequency, float volume, int interval, int rest) {
    speaker.period(1.0 / frequency);
    speaker = volume;
    wait(interval);
    speaker = 0.0;
    wait(rest);
}

int main()
{
    while(1) {
        play_tone(200.0, 0.5, 1, 0);
        play_tone(150.0, 0.5, 1, 0);
        play_tone(125.0, 0.5, 1, 2);
    }

}
