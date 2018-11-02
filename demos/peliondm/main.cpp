#include "mbed.h"
#include "mbed_events.h"
#include "simple-mbed-cloud-client.h"
#include "SimulatorBlockDevice.h"

EventQueue eventQueue;

SimulatorBlockDevice bd("myblockdevice", 128 * 512, 512);


int main() {
    NetworkInterface *net = NetworkInterface::get_default_instance();
    nsapi_error_t status = net->connect();

    if (status != NSAPI_ERROR_OK) {
        printf("Connecting to the network failed %d!\n", status);
        return -1;
    }

    printf("Connected to the network successfully. IP address: %s\n", net->get_ip_address());

    // SimpleMbedCloudClient handles registering over LwM2M to Mbed Cloud
    SimpleMbedCloudClient client(net, &bd);
    int client_status = client.init();
    if (client_status != 0) {
        printf("Pelion Client initialization failed (%d)\n", client_status);
        return -1;
    }
}
