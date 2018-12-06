#include "mbed.h"
#include "mbed_events.h"
#include "mbed_trace.h"
#include "simple-mbed-cloud-client.h"
#include "SimulatorBlockDevice.h"
#include "eventOS_scheduler.h"

SimulatorBlockDevice bd("myblockdevice", 128 * 512, 512);

// Declaring pointers for access to Pelion Device Management Client resources outside of main()
MbedCloudClientResource *button_res;
MbedCloudClientResource *pattern_res;

// This function gets triggered by the timer. It's easy to replace it by an InterruptIn and fall() mode on a real button
void fake_button_press() {
    int v = button_res->get_value_int() + 1;

    button_res->set_value(v);

    printf("Simulated button clicked %d times\n", v);
}

/**
 * PUT handler
 * @param resource The resource that triggered the callback
 * @param newValue Updated value for the resource
 */
void pattern_updated(MbedCloudClientResource *resource, m2m::String newValue) {
    printf("PUT received, new value: %s\n", newValue.c_str());
}

void blink() {
    static DigitalOut augmentedLed(LED1); // LED that is used for blinking the pattern
    augmentedLed = !augmentedLed;
}

/**
 * POST handler
 * @param resource The resource that triggered the callback
 * @param buffer If a body was passed to the POST function, this contains the data.
 *               Note that the buffer is deallocated after leaving this function, so copy it if you need it longer.
 * @param size Size of the body
 */
void blink_callback(MbedCloudClientResource *resource, const uint8_t *buffer, uint16_t size) {
    printf("POST received. Going to blink LED pattern: %s\n", pattern_res->get_value().c_str());

    // Parse the pattern string, and toggle the LED in that pattern
    string s = std::string(pattern_res->get_value().c_str());
    size_t i = 0;
    size_t pos = s.find(':');
    int total_len = 0;
    while (pos != string::npos) {
        int len = atoi(s.substr(i, pos - i).c_str());

        mbed_event_queue()->call_in(total_len + len, &blink);

        total_len += len;
        i = ++pos;
        pos = s.find(':', pos);
    }
}

/**
 * Notification callback handler
 * @param resource The resource that triggered the callback
 * @param status The delivery status of the notification
 */
void button_callback(MbedCloudClientResource *resource, const NoticationDeliveryStatus status) {
    printf("Button notification, status %s (%d)\n", MbedCloudClientResource::delivery_status_to_string(status), status);
}

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

    // mbed_trace_init();

    printf("Connected to the network successfully. IP address: %s\n", net->get_ip_address());

    // SimpleMbedCloudClient handles registering over LwM2M to Mbed Cloud
    SimpleMbedCloudClient client(net, &bd);
    int client_status = client.init();
    if (client_status != 0) {
        printf("Pelion Client initialization failed (%d)\n", client_status);
        return -1;
    }

    printf("Pelion Client initialized\n");

    // Creating resources, which can be written or read from the cloud
    button_res = client.create_resource("3200/0/5501", "button_count");
    button_res->set_value(0);
    button_res->methods(M2MMethod::GET);
    button_res->observable(true);
    button_res->attach_notification_callback(button_callback);

    pattern_res = client.create_resource("3201/0/5853", "blink_pattern");
    pattern_res->set_value("500:500:500:500:500:500:500:500");
    pattern_res->methods(M2MMethod::GET | M2MMethod::PUT);
    pattern_res->attach_put_callback(pattern_updated);

    MbedCloudClientResource *blink_res = client.create_resource("3201/0/5850", "blink_action");
    blink_res->methods(M2MMethod::POST);
    blink_res->attach_post_callback(mbed_event_queue()->event(blink_callback));

    // Callback that fires when registering is complete
    client.on_registered(&registered);

    // Register with Pelion Device Management
    int b = client.register_and_connect();

    // The timer fires on an interrupt context, but debounces it to the eventqueue, so it's safe to do network operations
    Ticker timer;
    timer.attach(mbed_event_queue()->event(&fake_button_press), 5.0);

    mbed_event_queue()->call_every(1, &eventOS_scheduler_run_until_idle);

    mbed_event_queue()->dispatch_forever();

    wait(osWaitForever);
}
