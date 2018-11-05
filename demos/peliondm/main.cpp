#include "mbed.h"
#include "mbed_events.h"
#include "mbed_trace.h"
#include "simple-mbed-cloud-client.h"
#include "SimulatorBlockDevice.h"

EventQueue eventQueue;

SimulatorBlockDevice bd("myblockdevice", 128 * 512, 512);

/**
 * Registration callback handler
 * @param endpoint Information about the registered endpoint such as the name (so you can find it back in portal)
 */
void registered(const ConnectorClientEndpointInfo *endpoint) {
    printf("Connected to Pelion Device Management. Endpoint Name: %s\n", endpoint->internal_endpoint_name.c_str());
}

int main() {
    NetworkInterface *net = NetworkInterface::get_default_instance();
    nsapi_error_t status = net->connect();

    if (status != NSAPI_ERROR_OK) {
        printf("Connecting to the network failed %d!\n", status);
        return -1;
    }

    mbed_trace_init();

    printf("Connected to the network successfully. IP address: %s\n", net->get_ip_address());

    // SimpleMbedCloudClient handles registering over LwM2M to Mbed Cloud
    SimpleMbedCloudClient client(net, &bd);
    printf("SMCC constructed\n");
    int client_status = client.init();
    if (client_status != 0) {
        printf("Pelion Client initialization failed (%d)\n", client_status);
        return -1;
    }

    printf("Pelion Client initialized\n");

    // Callback that fires when registering is complete
    client.on_registered(&registered);

    // Register with Pelion Device Management
    client.register_and_connect();

    mbed_event_queue()->dispatch_forever();
}
