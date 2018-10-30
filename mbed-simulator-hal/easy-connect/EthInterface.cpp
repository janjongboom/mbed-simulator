#include "EthInterface.h"
#include "EthernetInterface.h"

EthInterface* EthInterface::get_target_default_instance() {
    static EthernetInterface ethernet;
    return &ethernet;
}
