#include "mbed.h"
#include "C12832.h"
#include "Sht31.h"

C12832 lcd(SPI_MOSI, SPI_SCK, SPI_MISO, p8, p11);
Sht31 sht31(I2C_SDA, I2C_SCL);
DigitalOut led(LED1);

int main() {
    printf("Set the temperature above 25 degrees to trigger the warning LED\n");

    while (1) {
        lcd.cls();

        float temp = sht31.readTemperature();
        float humidity = sht31.readHumidity();

        lcd.locate(3, 3);
        lcd.printf("Temperature: %.2f C", temp);
        lcd.locate(3, 13);
        lcd.printf("Humidity: %.2f %%", humidity);

        // turn on LED if the temperature is above 25 degrees
        led = temp > 25.0f;

        wait(0.5f);
    }
}