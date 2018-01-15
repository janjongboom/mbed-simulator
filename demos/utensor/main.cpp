/**
 * This is a demo application for uTensor - an AI interference library for
 * deep learning on small microcontrollers.
 * It's trained to recognize handwritten digits via the MNIST data set.
 *
 * See https://github.com/utensor/utensor
 */

#include "mbed.h"
#include "tensor.hpp"
#include "deep_mnist_mlp.hpp"
#include "emscripten.h"
#include "C12832.h"

C12832 lcd(SPI_MOSI, SPI_SCK, SPI_MISO, p8, p11);

EventQueue queue;
InterruptIn btn(BUTTON1);

void run_mlp() {
    EM_ASM({
        // this writes the content of the canvas (in the simulator) to /fs/tmp.idx
        window.dumpCanvasToTmpFile();
    });

    // invoke the MLP algorithm against the temp file (just saved from canvas)
    int prediction = runMLP("/fs/tmp.idx");
    lcd.cls();
    lcd.locate(3, 13);
    lcd.printf("Predicted: %d", prediction);
}

int main(int argc, char** argv) {
    init_env();

    printf("Deep MLP on Mbed (Trained with Tensorflow)\n");
    printf("Draw a number (0-9) on the canvas, then hit the button on the board to run MLP algorithm\n\n");

    printf("Please draw the image as large as possible *in the gray box* for best results\n");

    btn.fall(queue.event(&run_mlp));

    queue.dispatch_forever();
}
