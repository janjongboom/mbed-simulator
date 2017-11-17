#include "mbed.h"
#include "C12832.h"

#define LCD_LINE1           3
#define LCD_LINE2           13
#define LCD_LINE3           23

// Functions to print to the LCD
#define print_to_lcd(x, y, format, ...) \
    lcd.locate(x, y); \
    lcd.printf(format, ##__VA_ARGS__); \

C12832 lcd(SPI_MOSI, SPI_SCK, SPI_MISO, p8, p11);

int main() {
    print_to_lcd(0, LCD_LINE1, "Hello world");

    int counter = 0;
    while (1) {
        print_to_lcd(0, LCD_LINE2, "Count: %d", ++counter);
        wait(0.5f);
    }
}