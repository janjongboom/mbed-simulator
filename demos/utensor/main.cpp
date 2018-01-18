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
#include "stm32f413h_discovery_ts.h"
#include "stm32f413h_discovery_lcd.h"

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

    BSP_LCD_Clear(LCD_COLOR_WHITE);
}

int main(int argc, char** argv) {
    init_env();

    printf("Deep MLP on Mbed (Trained with Tensorflow)\n");
    printf("Draw a number (0-9) on the canvas, then hit the button on the board to run MLP algorithm\n\n");

    printf("Please draw the image as large as possible *on the touch screen* for best results\n");

    TS_StateTypeDef TS_State = { 0 };

    BSP_LCD_Init();

    /* Touchscreen initialization */
    if (BSP_TS_Init(BSP_LCD_GetXSize(), BSP_LCD_GetYSize()) == TS_ERROR) {
        printf("BSP_TS_Init error\n");
    }

    /* Clear the LCD */
    BSP_LCD_Clear(LCD_COLOR_WHITE);

    bool btn_was_high = 0;
    while (1) {
        if (!btn_was_high && btn.read() == 1) {
            btn_was_high = 1;
            run_mlp();
        }

        if (btn.read() == 0) {
            btn_was_high = 0;
        }

        BSP_TS_GetState(&TS_State);
        if(TS_State.touchDetected) {
            /* One or dual touch have been detected          */

            /* Get X and Y position of the first touch post calibrated */
            uint16_t x1 = TS_State.touchX[0];
            uint16_t y1 = TS_State.touchY[0];

            BSP_LCD_SetTextColor(LCD_COLOR_BLACK);
            BSP_LCD_FillCircle(x1, y1, 5);

            wait_ms(10);
        }
    }
}
