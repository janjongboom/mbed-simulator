/***************************************************
  This is a library for the SHT31 Digital Humidity & Temp Sht31

  Designed specifically to work with the SHT31 Digital Sht31 from Adafruit
  ----> https://www.adafruit.com/products/2857

  These displays use I2C to communicate, 2 pins are required to
  interface
  Adafruit invests time and resources providing this open source code,
  please support Adafruit and open-source hardware by purchasing
  products from Adafruit!

  Written by Limor Fried/Ladyada for Adafruit Industries.
  BSD license, all text above must be included in any redistribution
 ****************************************************/

#include "Sht31.h"
#include "mbed.h"
#include "emscripten.h"

Sht31::Sht31(PinName sda, PinName scl) {
    EM_ASM_({
        window.MbedJSHal.sht31.init($0, $1, $2);
    }, this, sda, scl);
}

float Sht31::readTemperature(void) {
    int temp = EM_ASM_INT({
        return window.MbedJSHal.sht31.read_temperature($0);
    }, this);
    return ((float)temp) / 100.0f;
}

float Sht31::readHumidity(void) {
    int humidity = EM_ASM_INT({
        return window.MbedJSHal.sht31.read_humidity($0);
    }, this);
    return ((float)humidity) / 100.0f;
}
