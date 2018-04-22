/**
 * ST7789H2 LCD display and FT6x06 touch screen driver
 */

window.MbedJSHal.ST7789H2 = (function() {
    var  ST7789H2_LCD_PIXEL_WIDTH    = (240);
    var  ST7789H2_LCD_PIXEL_HEIGHT   = (240);

    /**
     *  @brief LCD_OrientationTypeDef
     *  Possible values of Display Orientation
     */
    var ST7789H2_ORIENTATION_PORTRAIT         = (0x00); /* Portrait orientation choice of LCD screen  */
    var ST7789H2_ORIENTATION_LANDSCAPE        = (0x01); /* Landscape orientation choice of LCD screen */
    var ST7789H2_ORIENTATION_LANDSCAPE_ROT180 = (0x02); /* Landscape rotated 180� orientation choice of LCD screen */

    /**
     * @brief  ST7789H2 Registers
     */
    var registers = {
        ST7789H2_LCD_ID             : 0x04,
        ST7789H2_SLEEP_IN           : 0x10,
        ST7789H2_SLEEP_OUT          : 0x11,
        ST7789H2_PARTIAL_DISPLAY    : 0x12,
        ST7789H2_DISPLAY_INVERSION  : 0x21,
        ST7789H2_DISPLAY_ON         : 0x29,
        ST7789H2_WRITE_RAM          : 0x2C,
        ST7789H2_READ_RAM           : 0x2E,
        ST7789H2_CASET              : 0x2A,
        ST7789H2_RASET              : 0x2B,
        ST7789H2_VSCRDEF            : 0x33, /* Vertical Scroll Definition */
        ST7789H2_VSCSAD             : 0x37, /* Vertical Scroll Start Address of RAM */
        ST7789H2_TEARING_EFFECT     : 0x35,
        ST7789H2_NORMAL_DISPLAY     : 0x36,
        ST7789H2_IDLE_MODE_OFF      : 0x38,
        ST7789H2_IDLE_MODE_ON       : 0x39,
        ST7789H2_COLOR_MODE         : 0x3A,
        ST7789H2_PORCH_CTRL         : 0xB2,
        ST7789H2_GATE_CTRL          : 0xB7,
        ST7789H2_VCOM_SET           : 0xBB,
        ST7789H2_DISPLAY_OFF        : 0xBD,
        ST7789H2_LCM_CTRL           : 0xC0,
        ST7789H2_VDV_VRH_EN         : 0xC2,
        ST7789H2_VDV_SET            : 0xC4,
        ST7789H2_VCOMH_OFFSET_SET   : 0xC5,
        ST7789H2_FR_CTRL            : 0xC6,
        ST7789H2_POWER_CTRL         : 0xD0,
        ST7789H2_PV_GAMMA_CTRL      : 0xE0,
        ST7789H2_NV_GAMMA_CTRL      : 0xE1
    };

    var obj = new EventEmitter();

    obj.CURR_COL = 0;
    obj.CURR_ROW = 0;

    obj.CURR_REG = null;
    obj.CURR_DATA = [];

    obj.pixels = {};

    obj.init = function() {
        obj.emit('init');
        console.log('init');
    };

    obj.readPixel = function(x, y) {
        if (!this.pixels[x] || !this.pixels[x][y]) return 0;
        return this.pixels[x][y];
    }

    obj.drawPixel = function(x, y, color) {
        this.pixels[x] = this.pixels[x] || {};
        this.pixels[x][y] = color;

        var r5 = (color >> 11);
        var g6 = (color >> 5) & 0x3f;
        var b5 = color & 0x1f;

        var r8 = ( r5 * 527 + 23 ) >> 6;
        var g8 = ( g6 * 259 + 33 ) >> 6;
        var b8 = ( b5 * 527 + 23 ) >> 6;

        obj.emit('set_pixel', x, y, [ r8, g8, b8 ]);
    };

    // 00011 100101 10110
    // 3, 37, 22

    obj.writeReg = function(reg) {
        switch (reg) {
            // set row
            case registers.ST7789H2_RASET:
                this.readNextData(4).then(function(d) {
                    this.CURR_ROW = d[1];
                }.bind(this));
                break;

            // set column
            case registers.ST7789H2_CASET:
                this.readNextData(4).then(function(d) {
                    this.CURR_COL = d[1];
                    console.log('HAL CASET', d[1]);
                }.bind(this));
                break;

            // write pixel I think?
            case registers.ST7789H2_WRITE_RAM:
                this.readNextData(1).then(function(d) {
                    console.log('HAL writePixel', this.CURR_COL, this.CURR_ROW, d[0]);
                }.bind(this));
                break;

            case registers.ST7789H2_LCD_ID:
                // can ignore safely
                break;

            default:
                console.log('Unknown register', reg, Object.keys(registers).filter(r => registers[r] === reg)[0]);
                break;
        }
    };

    obj.readNextData = function(frames) {
        var self = this;
        var d = [];
        return new Promise(function(resolve, reject) {
            function onData(data) {
                d.push(data);
                frames--;
                if (frames === 0) {
                    self.removeListener('data', onData);
                    resolve(d);
                }
            }
            self.addListener('data', onData);
        });
    };

    obj.writeData = function(val) {
        this.emit('data', val);
    };
    obj.readData = function() {
        return 1;
    };

    obj._touchX = -1;
    obj._touchY = -1;

    obj.getTouchX = function() {
        return this._touchX;
    };
    obj.getTouchY = function() {
        return this._touchY;
    };

    obj.updateTouch = function(down, x, y) {
        if (down) {
            this._touchX = x;
            this._touchY = y;
        }
        else {
            this._touchX = this._touchY = -1;
        }
    };


    return obj;
})();
