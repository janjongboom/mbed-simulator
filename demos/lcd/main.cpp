#include "mbed.h"
#include "C12832.h"
#include "graphics.h"

C12832 lcd(SPI_MOSI, SPI_SCK, SPI_MISO, p8, p11);

// From https://os.mbed.com/users/dreschpe/code/Christmas-LCD

int main()
{
    printf("Demo by Peter Dresche\n");
    printf("https://os.mbed.com/users/dreschpe/code/Christmas-LCD\n");
    int i,s;
    lcd.cls();
    // lcd.set_font((unsigned char*) Arial_9);
    s = 3;
    lcd.print_bm(bitmTree,95,0);  // print chistmas tree
    lcd.copy_to_lcd();
    lcd.setmode(XOR);             // XOR - a second print will erase
    for(i = -15; i < 75; ){
        lcd.print_bm(bitmSan1,i,2);
        wait(0.2);
        lcd.copy_to_lcd();           // update lcd
        lcd.print_bm(bitmSan1,i,2);  // erase
        i= i+s;
        lcd.print_bm(bitmSan2,i,2);  // print next
        wait(0.2);
        lcd.copy_to_lcd();           // update lcd
        lcd.print_bm(bitmSan2,i,2);  // erase
        i= i+s;
        lcd.print_bm(bitmSan3,i,2);  // print next
        wait(0.2);
        lcd.copy_to_lcd();           // update lcd
        lcd.print_bm(bitmSan3,i,2);  // erase
        i= i+s;
   }
   lcd.print_bm(bitmSan3,i,2);
   lcd.set_auto_up(0);
   for(i=-20; i<5; i++){             // scrolling text
     lcd.locate(5,i);
     lcd.printf("Happy");
     lcd.locate(5,i+12);
     lcd.printf("Christmas");
     lcd.copy_to_lcd();
     lcd.locate(5,i);
     wait(0.2);
     lcd.printf("Happy");
     lcd.locate(5,i+12);
     lcd.printf("Christmas");
     lcd.copy_to_lcd();
     i=i+1;
   }
   lcd.locate(5,i);
   lcd.printf("Happy");
   lcd.locate(5,i+12);
   lcd.printf("Christmas");
   lcd.copy_to_lcd();

   printf("Done!\n");

}