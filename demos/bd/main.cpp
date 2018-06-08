#include "mbed.h"
#include "mbed_events.h"
#include "SimulatorBlockDevice.h"

#define BD_PAGE_SIZE               512

// Initialize a persistent block device with 512 bytes block size, and 128 blocks (64K of storage)
SimulatorBlockDevice bd("myblockdevice", 128 * BD_PAGE_SIZE, BD_PAGE_SIZE);

// buffer to store the counter
uint32_t *page_buffer;

EventQueue queue;
InterruptIn btn(BUTTON1);

void btn_fall() {
    // up the counter
    page_buffer[0]++;

    // store the page
    bd.program(page_buffer, 0x0, BD_PAGE_SIZE);

    printf("Counter is now %d\n", page_buffer[0]);
}

int main() {
    printf("The Simulator contains a persistent block device implementation\n");
    printf("Data is stored between page refreshes in the browser's local storage\n");

    printf("\nPress the button to increase the counter\nRefresh the page to see that data is persistent\n\n");

    if (bd.init() != 0) {
        printf("Blockdevice initialization failed!\n");
        return 1;
    }

    // initialize memory for the page buffer
    page_buffer = (uint32_t*)malloc(BD_PAGE_SIZE);

    // read the data back from the block device
    bd.read(page_buffer, 0x0, BD_PAGE_SIZE);

    printf("Counter initial value is %d\n", page_buffer[0]);

    // button fall IRQ handler
    btn.fall(queue.event(&btn_fall));

    queue.dispatch_forever();
}
