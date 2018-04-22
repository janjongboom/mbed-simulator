#include "stm32f413h_discovery.h"

void LCD_IO_Init(void) {
    EM_ASM({
        window.MbedJSHal.ST7789H2.init();
    });
}

void LCD_IO_Delay(uint32_t delay) {
    // noop
}

void LCD_IO_WriteReg(uint8_t Reg) {
    EM_ASM_({
        window.MbedJSHal.ST7789H2.writeReg($0);
    }, Reg);
}

void LCD_IO_WriteData(uint16_t RegValue) {
    EM_ASM_({
        window.MbedJSHal.ST7789H2.writeData($0);
    }, RegValue);
}

uint16_t LCD_IO_ReadData(void) {
    return (uint16_t)(EM_ASM_INT({
        window.MbedJSHal.ST7789H2.readData();
    }));
}
