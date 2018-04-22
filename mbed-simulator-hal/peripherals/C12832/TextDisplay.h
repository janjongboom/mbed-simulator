/* mbed TextDisplay Library Base Class
 * Copyright (c) 2007-2009 sford
 * Released under the MIT License: http://mbed.org/license/mit
 *
 * A common base class for Text displays
 * To port a new display, derive from this class and implement
 * the constructor (setup the display), character (put a character
 * at a location), rows and columns (number of rows/cols) functions.
 * Everything else (locate, printf, putc, cls) will come for free
 *
 * The model is the display will wrap at the right and bottom, so you can
 * keep writing and will always get valid characters. The location is
 * maintained internally to the class to make this easy
 */

#ifndef MBED_TEXTDISPLAY_H
#define MBED_TEXTDISPLAY_H

#include "mbed.h"
#include "Stream.h"

class TextDisplay : public Stream {
public:

  // functions needing implementation in derived implementation class
  /** Create a TextDisplay interface
     *
     * @param name The name used in the path to access the strean through the filesystem
     */
    TextDisplay(const char *name = NULL);

    /** output a character at the given position
     *
     * @param column column where charater must be written
     * @param  row where character must be written
     * @param c the character to be written to the TextDisplay
     */
    virtual void character(int column, int row, int c) = 0;

    /** return number if rows on TextDisplay
     * @result number of rows
     */
    virtual int rows() = 0;

    /** return number if columns on TextDisplay
    * @result number of rows
    */
    virtual int columns() = 0;

    // functions that come for free, but can be overwritten

    /** redirect output from a stream (stoud, sterr) to  display
    * @param stream stream that shall be redirected to the TextDisplay
    */
    virtual bool claim (FILE *stream);

    /** clear screen
    */
    virtual void cls();
    virtual void locate(int column, int row);
    virtual void foreground(uint16_t colour);
    virtual void background(uint16_t colour);
    // putc (from Stream)
    // printf (from Stream)

    virtual int _putc(int c);
    virtual int _getc();
    virtual void _flush() = 0;

protected:
    // character location
    uint16_t _column;
    uint16_t _row;

    // colours
    uint16_t _foreground;
    uint16_t _background;
    char *_path;
};

#endif
