#include "mbed.h"
#include "mbed_events.h"
#include "mbed_trace.h"
#include "simple-mbed-cloud-client.h"
#include "SimulatorBlockDevice.h"
#include "eventOS_scheduler.h"

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

    MbedCloudClientResource *button_res = client.create_resource("3200/0/5501", "button_count");
    button_res->set_value(0);
    button_res->methods(M2MMethod::GET);
    button_res->observable(true);
    // button_res->attach_notification_callback(button_callback);

    // Callback that fires when registering is complete
    client.on_registered(&registered);

    printf("on_registered called\n");

    // Register with Pelion Device Management
    int b = client.register_and_connect();
    printf("register_and_connect returned %d\n", b);

    mbed_event_queue()->call_every(1, &eventOS_scheduler_run_until_idle);

    mbed_event_queue()->dispatch_forever();

    wait(osWaitForever);
}
