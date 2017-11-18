#include "mbed.h"
#include "C12832.h"

C12832 lcd(SPI_MOSI, SPI_SCK, SPI_MISO, p8, p11);

// From https://os.mbed.com/users/dreschpe/code/Christmas-LCD

// graphics for the Christmas Demo
//
// Copyright (c) 2012 Peter Drescher - DC2PD
// made by hand - I have to look for a tool ;-)
// Released under the MIT License: http://mbed.org/license/mit

static char Tree[] = {
  0x00, 0x00, 0x40, 0x00, 0x00, // XXXXXXXX, XXXXXXXX, X_XXXXXX, XXXXXXXX, XXXX
  0x00, 0x00, 0x40, 0x00, 0x00, // XXXXXXXX, XXXXXXXX, X_XXXXXX, XXXXXXXX, XXXX
  0x00, 0x00, 0xE0, 0x00, 0x00, // XXXXXXXX, XXXXXXXX, ___XXXXX, XXXXXXXX, XXXX
  0x00, 0x01, 0xE0, 0x00, 0x00, // XXXXXXXX, XXXXXXX_, ___XXXXX, XXXXXXXX, XXXX
  0x00, 0x03, 0xF0, 0x00, 0x00, // XXXXXXXX, XXXXXX__, ____XXXX, XXXXXXXX, XXXX
  0x00, 0x07, 0xF8, 0x00, 0x00, // XXXXXXXX, XXXXX___, _____XXX, XXXXXXXX, XXXX
  0x00, 0x07, 0x7C, 0x00, 0x00, // XXXXXXXX, XXXXX___, X_____XX, XXXXXXXX, XXXX
  0x00, 0x0E, 0xBC, 0x00, 0x00, // XXXXXXXX, XXXX___X, _X____XX, XXXXXXXX, XXXX
  0x00, 0x03, 0x78, 0x00, 0x00, // XXXXXXXX, XXXXXX__, X____XXX, XXXXXXXX, XXXX
  0x00, 0x07, 0xfC, 0x00, 0x00, // XXXXXXXX, XXXXX___, ______XX, XXXXXXXX, XXXX
  0x00, 0x0F, 0xfe, 0x00, 0x00, // XXXXXXXX, XXXX____, _______X, XXXXXXXX, XXXX
  0x00, 0x1f, 0xff, 0x80, 0x00, // XXXXXXXX, XXX_____, ________, _XXXXXXX, XXXX
  0x00, 0x7f, 0xff, 0xc0, 0x00, // XXXXXXXX, X_______, ________, __XXXXXX, XXXX
  0x00, 0x0f, 0xdc, 0x00, 0x00, // XXXXXXXX, XXXX____, __X___XX, XXXXXXXX, XXXX
  0x00, 0x3F, 0xaf, 0x00, 0x00, // XXXXXXXX, XX______, _X_X____, XXXXXXXX, XXXX
  0x00, 0xff, 0xdf, 0xc0, 0x00, // XXXXXXXX, ________, __X_____, __XXXXXX, XXXX
  0x01, 0xff, 0xff, 0xf0, 0x00, // XXXXXXX_, ________, ________, ____XXXX, XXXX
  0x07, 0xf7, 0xff, 0xfc, 0x00, // XXXXX___, ____X___, ________, ______XX, XXXX
  0x0f, 0xeb, 0xff, 0x7C, 0x00, // XXXX____, ___X_X__, ________, X_____XX, XXXX
  0x03, 0xf7, 0xfe, 0xA0, 0x00, // XXXXXX__, ____X___, _______X, _X_XXXXX, XXXX
  0x1f, 0xff, 0xff, 0x78, 0x00, // XXX_____, ________, ________, X____XXX, XXXX
  0x7F, 0xff, 0xff, 0xfe, 0x00, // X_______, ________, ________, _______X, XXXX
  0xff, 0xff, 0xff, 0xff, 0x80, // ________, ________, ________, ________, _XXX
  0x0f, 0xff, 0xff, 0xf3, 0x80, // XXXX____, ________, ________, ____XX__, _XXX
  0x00, 0x00, 0xc0, 0x01, 0x00, // XXXXXXXX, XXXXXXXX, __XXXXXX, XXXXXXX_, XXXX
  0x00, 0x00, 0xc0, 0x02, 0x80, // XXXXXXXX, XXXXXXXX, __XXXXXX, XXXXXX_X, _XXX
  0x00, 0x00, 0xc0, 0x01, 0x00, // XXXXXXXX, XXXXXXXX, __XXXXXX, XXXXXXX_, XXXX
  0x00, 0x00, 0x00, 0x00, 0x00  // XXXXXXXX, XXXXXXXX, XXXXXXXX, XXXXXXXX, XXXX
};

Bitmap bitmTree = {
  36, // XSize
  28, // YSize
  5, // Bytes in Line
  Tree,  // Pointer to picture data
};


static char Santa1[] = {
  0x07, 0x00, 0x00, // XXXXX___, XXXXXXXX, X
  0x05, 0x00, 0x00, // XXXXX_X_, XXXXXXXX, X
  0x07, 0x00, 0x00, // XXXXX___, XXXXXXXX, X
  0x07, 0xC0, 0x00, // XXXXX___, __XXXXXX, X
  0x07, 0xE0, 0x00, // XXXXX___, ___XXXXX, X
  0x07, 0xF0, 0x00, // XXXXX___, ____XXXX, X
  0x0F, 0xF8, 0x00, // XXXX____, _____XXX, X
  0x1c, 0x08, 0x00, // XXX___XX, XXXX_XXX, X
  0x08, 0xA8, 0x00, // XXXX_XXX, _X_X_XXX, X
  0x0C, 0x08, 0x00, // XXXX__XX, XXXX_XXX, X
  0x06, 0x28, 0x00, // XXXXX__X, XX_X_XXX, X
  0x03, 0x98, 0x00, // XXXXXX__, _XX__XXX, X
  0x0d, 0xfe, 0x00, // XXXX__X_, _______X, X
  0x78, 0xf3, 0x00, // X____XXX, ____XX__, X
  0x50, 0x61, 0x80, // X_X_XXXX, X__XXXX_, _
  0xd0, 0x60, 0x80, // __X_XXXX, X__XXXXX, _
  0x90, 0x00, 0x80, // _XX_XXXX, XXXXXXXX, _
  0x90, 0x01, 0x00, // _XX_XXXX, XXXXXXX_, X
  0x90, 0x01, 0x00, // _XX_XXXX, XXXXXXX_, X
  0xd0, 0x03, 0x00, // __X_XXXX, XXXXXX__, X
  0x70, 0x02, 0x00, // X___XXXX, XXXXXX_X, X
  0x1f, 0xfc, 0x00, // XXX_____, ______XX, X
  0x07, 0xfc, 0x00, // XXXXX___, ______XX, X
  0x07, 0x0c, 0x00, // XXXXX___, XXXX__XX, X
  0x07, 0x0c, 0x00, // XXXXX___, XXXX__XX, X
  0x07, 0xbc, 0x00, // XXXXX___, _X____XX, X
  0x03, 0x38, 0x00, // XXXXXX__, XX___XXX, X
  0x00, 0x20, 0x00, // XXXXXXXX, XX_XXXXX, X
};

Bitmap bitmSan1 = {
  17, // XSize
  28, // YSize
  3,  // Bytes in Line
  Santa1 ,  // Pointer to picture data
};


static char Santa2[] = {
  0x03, 0x80, 0x00 , // XXXXXX__, _XXXXXXX, X
  0x02, 0x80, 0x00 , // XXXXXX_X, _XXXXXXX, X
  0x07, 0x00, 0x00 , // XXXXX___, XXXXXXXX, X
  0x07, 0xc0, 0x00 , // XXXXX___, __XXXXXX, X
  0x07, 0xe0, 0x00 , // XXXXX___, ___XXXXX, X
  0x07, 0xf0, 0x00 , // XXXXX___, ____XXXX, X
  0x0f, 0xf8, 0x00 , // XXXX____, _____XXX, X
  0x1c, 0x08, 0x00 , // XXX___XX, XXXX_XXX, X
  0x08, 0xa8, 0x00 , // XXXX_XXX, _X_X_XXX, X
  0x0c, 0x08, 0x00 , // XXXX__XX, XXXX_XXX, X
  0x06, 0x28, 0x00 , // XXXXX__X, XX_X_XXX, X
  0x03, 0x98, 0x00 , // XXXXXX__, _XX__XXX, X
  0x0d, 0xf6, 0x00 , // XXXX__X_, ____X__X, X
  0x78, 0xf3, 0x00 , // X____XXX, ____XX__, X
  0x50, 0x61, 0x80 , // X_X_XXXX, X__XXXX_, _
  0xd0, 0x60, 0x80 , // __X_XXXX, X__XXXXX, _
  0x90, 0x00, 0x80 , // _XX_XXXX, XXXXXXXX, _
  0x90, 0x01, 0x00 , // _XX_XXXX, XXXXXXX_, X
  0x90, 0x01, 0x00 , // _XX_XXXX, XXXXXXX_, X
  0xd0, 0x03, 0x00 , // __X_XXXX, XXXXXX__, X
  0x70, 0x02, 0x00 , // X___XXXX, XXXXXX_X, X
  0x1f, 0xfc, 0x00 , // XXX_____, ______XX, X
  0x07, 0xdc, 0x00 , // XXXXX___, __X___XX, X
  0x07, 0x0e, 0x00 , // XXXXX___, XXXX___X, X
  0x07, 0x0e, 0x00 , // XXXXX___, XXXX___X, X
  0x0e, 0x0f, 0x80 , // XXXX___X, XXXX____, _
  0x08, 0x00, 0x00 , // XXXX_XXX, XXXXXXXX, X
  0x00, 0x00, 0x00 , // XXXXXXXX, XXXXXXXX, X
};

Bitmap bitmSan2 = {
  17, // XSize
  28, // YSize
  3,  // Bytes in Line
  Santa2 ,  // Pointer to picture data
};


static char Santa3[] = {
  0x1c, 0x00, 0x00 , //XXX___XX, XXXXXXXX, X
  0x17, 0x00, 0x00 , //XXX_X___, XXXXXXXX, X
  0x1f, 0xc0, 0x00 , //XXX_____, __XXXXXX, X
  0x07, 0xe0, 0x00 , //XXXXX___, ___XXXXX, X
  0x07, 0xf0, 0x00 , //XXXXX___, ____XXXX, X
  0x0f, 0xf8, 0x00 , //XXXX____, _____XXX, X
  0x1c, 0x08, 0x00 , //XXX___XX, XXXX_XXX, X
  0x08, 0xa8, 0x00 , //XXXX_XXX, _X_X_XXX, X
  0x0c, 0x08, 0x00 , //XXXX__XX, XXXX_XXX, X
  0x06, 0x28, 0x00 , //XXXXX__X, XX_X_XXX, X
  0x03, 0x98, 0x00 , //XXXXXX__, _XX__XXX, X
  0x0d, 0xf6, 0x00 , //XXXX__X_, ____X__X, X
  0x78, 0xf3, 0x00 , //X____XXX, ____XX__, X
  0x50, 0xe1, 0x80 , //X_X_XXXX, ___XXXX_, _
  0xd0, 0x60, 0x80 , //__X_XXXX, X__XXXXX, _
  0x90, 0x00, 0x80 , //_XX_XXXX, XXXXXXXX, _
  0x90, 0x01, 0x00 , //_XX_XXXX, XXXXXXX_, X
  0x90, 0x01, 0x00 , //_XX_XXXX, XXXXXXX_, X
  0x20, 0x03, 0x00 , //__X_XXXX, XXXXXX__, X
  0x70, 0x02, 0x00 , //X___XXXX, XXXXXX_X, X
  0x1f, 0xfc, 0x00 , //XXX_____, ______XX, X
  0x07, 0xdc, 0x00 , //XXXXX___, __X___XX, X
  0x07, 0x0e, 0x00 , //XXXXX___, XXXX___X, X
  0x07, 0x0e, 0x00 , //XXXXX___, XXXX___X, X
  0x07, 0xcf, 0x80 , //XXXXX___, __XX____, _
  0x00, 0x00, 0x00 , //XXXXXXXX, XXXXXXXX, X
};

Bitmap bitmSan3 = {
  17, // XSize
  26, // YSize
  3,  // Bytes in Line
  Santa3 ,  // Pointer to picture data
};

int main() {
    printf("Demo by Peter Dresche\n");
    printf("https://os.mbed.com/users/dreschpe/code/Christmas-LCD\n");
    int i, s;
    lcd.cls();
    // lcd.set_font((unsigned char*) Arial_9);
    s = 3;
    lcd.print_bm(bitmTree, 95, 0); // print chistmas tree
    lcd.copy_to_lcd();
    lcd.setmode(XOR); // XOR - a second print will erase
    for (i = -15; i < 75;) {
        lcd.print_bm(bitmSan1, i, 2);
        wait(0.2);
        lcd.copy_to_lcd(); // update lcd
        lcd.print_bm(bitmSan1, i, 2); // erase
        i = i + s;
        lcd.print_bm(bitmSan2, i, 2); // print next
        wait(0.2);
        lcd.copy_to_lcd(); // update lcd
        lcd.print_bm(bitmSan2, i, 2); // erase
        i = i + s;
        lcd.print_bm(bitmSan3, i, 2); // print next
        wait(0.2);
        lcd.copy_to_lcd(); // update lcd
        lcd.print_bm(bitmSan3, i, 2); // erase
        i = i + s;
    }
    lcd.print_bm(bitmSan3, i, 2);
    lcd.set_auto_up(0);
    for (i = -20; i < 5; i++) { // scrolling text
        lcd.locate(5, i);
        lcd.printf("Happy");
        lcd.locate(5, i + 12);
        lcd.printf("Christmas");
        lcd.copy_to_lcd();
        lcd.locate(5, i);
        wait(0.2);
        lcd.printf("Happy");
        lcd.locate(5, i + 12);
        lcd.printf("Christmas");
        lcd.copy_to_lcd();
        i = i + 1;
    }
    lcd.locate(5, i);
    lcd.printf("Happy");
    lcd.locate(5, i + 12);
    lcd.printf("Christmas");
    lcd.copy_to_lcd();

    printf("Done!\n");
  }
