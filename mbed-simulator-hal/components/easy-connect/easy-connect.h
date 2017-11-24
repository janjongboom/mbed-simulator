#ifndef __EASY_CONNECT_H__
#define __EASY_CONNECT_H__

#include "mbed.h"
#include "EthernetInterface.h"

/* \brief print_MAC - print_MAC  - helper function to print out MAC address
 * in: network_interface - pointer to network i/f
 *     bool log-messages   print out logs or not
 * MAC address is print, if it can be acquired & log_messages is true.
 *
 */
void print_MAC(NetworkInterface* network_interface, bool log_messages);

/* \brief easy_connect - easy_connect function to connect the pre-defined network bearer,
 *                       config done via mbed_app.json (see README.md for details).
 * IN: bool log_messages  print out diagnostics or not.
 *
 */
NetworkInterface* easy_connect(bool log_messages = false);

#endif
