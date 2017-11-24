#include "easy-connect.h"

void print_MAC(NetworkInterface* network_interface, bool log_messages) {
#if MBED_CONF_APP_NETWORK_INTERFACE != CELLULAR_ONBOARD
    const char *mac_addr = network_interface->get_mac_address();
    if (mac_addr == NULL) {
        if (log_messages) {
            printf("[EasyConnect] ERROR - No MAC address\n");
        }
        return;
    }
    if (log_messages) {
        printf("[EasyConnect] MAC address %s\n", mac_addr);
    }
#endif
}

NetworkInterface* easy_connect(bool log_messages) {
    NetworkInterface *network_interface = new EthernetInterface();

    int connect_success = network_interface->connect();

    if(connect_success == 0) {
        if (log_messages) {
            printf("[EasyConnect] Connected to Network successfully\n");
            print_MAC(network_interface, log_messages);
        }
    } else {
        if (log_messages) {
            print_MAC(network_interface, log_messages);
            printf("[EasyConnect] Connection to Network Failed %d!\n", connect_success);
        }
        return NULL;
    }
    const char *ip_addr  = network_interface->get_ip_address();
    if (ip_addr == NULL) {
        if (log_messages) {
            printf("[EasyConnect] ERROR - No IP address\n");
        }
        return NULL;
    }

    if (log_messages) {
        printf("[EasyConnect] IP address %s\n", ip_addr);
    }

    return network_interface;
}
