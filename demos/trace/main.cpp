#define MBED_CONF_MBED_TRACE_ENABLE 1

#include "mbed-trace/mbed_trace.h"
#define TRACE_GROUP  "main"

int main() {
    mbed_trace_init();       // initialize the trace library

    tr_debug("this is debug msg");  //-> "[DBG ][main]: this is a debug msg"
    tr_info("this is info msg");    //-> "[INFO][main]: this is an info msg"
    tr_warn("this is warning msg"); //-> "[WARN][main]: this is a warning msg"
    tr_err("this is error msg");    //-> "[ERR ][main]: this is an error msg"

    const char arr[] = { 30, 31, 32 };
    tr_debug("printing array: %s", mbed_trace_array((const uint8_t*)arr, 3)); //-> "[DBG ][main]: printing array: 01:02:03"

    return 0;
}
