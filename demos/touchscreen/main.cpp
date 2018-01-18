/**
 * This is a demo which uses the ST DISCO_F413ZH LCD and touch screen
 * Contains a FRIDA FRD154BP2901 LCD display
 * Code from https://os.mbed.com/teams/ST/code/DISCO_F413ZH-touch-screen-demo/?platform=ST-Discovery-F413H
 */

#include "mbed.h"
#include "stm32f413h_discovery_ts.h"
#include "stm32f413h_discovery_lcd.h"

TS_StateTypeDef TS_State = { 0 };

int main() {
    printf("Draw on the screen!\n");

    BSP_LCD_Init();

    /* Touchscreen initialization */
    if (BSP_TS_Init(BSP_LCD_GetXSize(), BSP_LCD_GetYSize()) == TS_ERROR) {
        printf("BSP_TS_Init error\n");
    }

    /* Clear the LCD */
    BSP_LCD_Clear(LCD_COLOR_WHITE);

    /* Set Touchscreen Demo1 description */
    BSP_LCD_SetTextColor(LCD_COLOR_GREEN);
    BSP_LCD_FillRect(0, 0, BSP_LCD_GetXSize(), 40);
    BSP_LCD_SetTextColor(LCD_COLOR_BLACK);
    BSP_LCD_SetBackColor(LCD_COLOR_GREEN);
    BSP_LCD_SetFont(&Font16);
    BSP_LCD_DisplayStringAt(0, 15, (uint8_t *)"Touch the screen", CENTER_MODE);

    while (1) {
        BSP_TS_GetState(&TS_State);
        if(TS_State.touchDetected) {
            /* One or dual touch have been detected          */

            /* Get X and Y position of the first touch post calibrated */
            uint16_t x1 = TS_State.touchX[0];
            uint16_t y1 = TS_State.touchY[0];

            BSP_LCD_SetTextColor(LCD_COLOR_RED);
            BSP_LCD_FillCircle(x1, y1, 5);

            wait_ms(10);
        }
    }
}
