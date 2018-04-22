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

#ifndef Sht31_H
#define Sht31_H

#include "mbed.h"

#define SHT31_DEFAULT_ADDR          0x44
#define SHT31_MEAS_HIGHREP_STRETCH  0x2C06
#define SHT31_MEAS_MEDREP_STRETCH   0x2C0D
#define SHT31_MEAS_LOWREP_STRETCH   0x2C10
#define SHT31_MEAS_HIGHREP          0x2400
#define SHT31_MEAS_MEDREP           0x240B
#define SHT31_MEAS_LOWREP           0x2416
#define SHT31_READSTATUS            0xF32D
#define SHT31_CLEARSTATUS           0x3041
#define SHT31_SOFTRESET             0x30A2
#define SHT31_HEATEREN              0x306D
#define SHT31_HEATERDIS             0x3066

class Sht31 {
public:
    Sht31(PinName sda, PinName scl);
    float readTemperature(void);
    float readHumidity(void);
};

#endif
