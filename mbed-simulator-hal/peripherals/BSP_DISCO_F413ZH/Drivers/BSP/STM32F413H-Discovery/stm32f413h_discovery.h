#ifndef _STM32F413H_DISCOVERY_H_
#define _STM32F413H_DISCOVERY_H_

#include <stdint.h>
#include "emscripten.h"

#define     __IO    volatile
#define     __weak  __attribute__((weak))

void LCD_IO_Init(void);
void LCD_IO_Delay(uint32_t delay);
void LCD_IO_WriteReg(uint8_t Reg);
void LCD_IO_WriteData(uint16_t RegValue);
uint16_t LCD_IO_ReadData(void);

#endif // _STM32F413H_DISCOVERY_H_
