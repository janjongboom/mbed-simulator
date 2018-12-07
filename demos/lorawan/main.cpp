#include "mbed.h"
#include "mbed_trace.h"
#include "mbed_events.h"
#include "LoRaWANInterface.h"
#include "Sht31.h"
#include "SX1276_LoRaRadio.h"

static uint8_t CLASS_A_DEV_EUI[] = { 0x00, 0xA9, 0x9D, 0x49, 0x21, 0xB2, 0x6D, 0x75 };
static uint8_t CLASS_A_APP_EUI[] = { 0x70, 0xB3, 0xD5, 0x7E, 0xD0, 0x00, 0xC1, 0x84 };
static uint8_t CLASS_A_APP_KEY[] = { 0xE1, 0x13, 0x6D, 0x7E, 0xB6, 0x91, 0x7F, 0xC4, 0xD5, 0x1F, 0x00, 0x14, 0x51, 0x1B, 0x86, 0xB1 };

static uint32_t CLASS_C_DEVADDR = 0x0001187e;
static uint8_t CLASS_C_NWK_S_KEY[] = { 0xd5, 0x16, 0xfb, 0x94, 0x6e, 0x1d, 0xf3, 0x67, 0xb8, 0xd8, 0x78, 0x12, 0x86, 0x36, 0x14, 0x8a };
static uint8_t CLASS_C_APP_S_KEY[] = { 0x64, 0x42, 0x26, 0xa6, 0x6b, 0x27, 0x85, 0x4b, 0x27, 0xe9, 0x5c, 0xcc, 0xdd, 0x08, 0xe2, 0x95 };

// The port we're sending and receiving on
#define MBED_CONF_LORA_APP_PORT     15

// Peripherals (LoRa radio, temperature sensor and button)
SX1276_LoRaRadio radio(D11, D12, D13, D10, A0, D2, D3, D4, D5, D8, D9, NC, NC, NC, NC, A4, NC, NC);
Sht31 sht31(I2C_SDA, I2C_SCL);
InterruptIn btn(BUTTON1);

// EventQueue is required to dispatch events around
static EventQueue ev_queue;

// Constructing Mbed LoRaWANInterface and passing it down the radio object.
static LoRaWANInterface lorawan(radio);

// Application specific callbacks
static lorawan_app_callbacks_t callbacks;

// LoRaWAN stack event handler
static void lora_event_handler(lorawan_event_t event);

static uint8_t send_message_counter = 0;
static loramac_protocol_params class_a_params;
static loramac_protocol_params class_c_params;

// Send a message over LoRaWAN
static void send_message() {
    send_message_counter++;

    printf("send_message_counter is now %u\n", send_message_counter);

    if (send_message_counter == 3) {
        printf("Gonna switch to class C now!\n");

        // store the class A parameters
        lorawan.get_session(&class_a_params);

        // copy them to the class C params...
        memcpy(&class_c_params, &class_a_params, sizeof(loramac_protocol_params));
        class_c_params.dl_frame_counter = 0;
        class_c_params.ul_frame_counter = 0;
        class_c_params.dev_addr = CLASS_C_DEVADDR;
        memcpy(class_c_params.keys.nwk_skey, CLASS_C_NWK_S_KEY, sizeof(CLASS_C_NWK_S_KEY));
        memcpy(class_c_params.keys.app_skey, CLASS_C_APP_S_KEY, sizeof(CLASS_C_APP_S_KEY));

        // and set the class C session
        lorawan.set_session(&class_c_params);
        lorawan.set_device_class(CLASS_C);
    }

    if (send_message_counter == 6) {
        printf("Gonna switch back to class A now!\n");

        // store the class C session
        lorawan.get_session(&class_c_params);

        // put back the class A session
        lorawan.set_session(&class_a_params);
        lorawan.set_device_class(CLASS_A);
    }

    uint8_t tx_buffer[50] = { 0 };

    // Sending strings over LoRaWAN is not recommended
    sprintf((char*) tx_buffer, "Temperature = %3.1f",
                                   sht31.readTemperature());

    int packet_len = strlen((char*) tx_buffer);

    printf("Sending %d bytes: \"%s\"\n", packet_len, tx_buffer);

    int16_t retcode = lorawan.send(MBED_CONF_LORA_APP_PORT, tx_buffer, packet_len, MSG_UNCONFIRMED_FLAG);

    // for some reason send() returns -1... I cannot find out why, the stack returns the right number. I feel that this is some weird Emscripten quirk
    if (retcode < 0) {
        retcode == LORAWAN_STATUS_WOULD_BLOCK ? printf("send - duty cycle violation\n")
                : printf("send() - Error code %d\n", retcode);
        return;
    }

    printf("%d bytes scheduled for transmission\n", retcode);
}

int main() {
    printf("Press BUTTON1 to send the current value of the temperature sensor!\n");

    // Enable trace output for this demo, so we can see what the LoRaWAN stack does
    mbed_trace_init();

    if (lorawan.initialize(&ev_queue) != LORAWAN_STATUS_OK) {
        printf("LoRa initialization failed!\n");
        return -1;
    }

    // Fire a message when the button is pressed
    btn.fall(ev_queue.event(&send_message));

    // prepare application callbacks
    callbacks.events = mbed::callback(lora_event_handler);
    lorawan.add_app_callbacks(&callbacks);

    // Disable adaptive data rating
    if (lorawan.disable_adaptive_datarate() != LORAWAN_STATUS_OK) {
        printf("disable_adaptive_datarate failed!\n");
        return -1;
    }

    lorawan.set_datarate(5); // SF7BW125
    lorawan.set_device_class(CLASS_A);

    lorawan_connect_t connect_params;
    connect_params.connect_type = LORAWAN_CONNECTION_OTAA;
    connect_params.connection_u.otaa.dev_eui = CLASS_A_DEV_EUI;
    connect_params.connection_u.otaa.app_eui = CLASS_A_APP_EUI;
    connect_params.connection_u.otaa.app_key = CLASS_A_APP_KEY;
    connect_params.connection_u.otaa.nb_trials = 3;

    lorawan_status_t retcode = lorawan.connect(connect_params);

    if (retcode == LORAWAN_STATUS_OK ||
        retcode == LORAWAN_STATUS_CONNECT_IN_PROGRESS) {
    } else {
        printf("Connection error, code = %d\n", retcode);
        return -1;
    }

    printf("Connection - In Progress ...\r\n");

    // make your event queue dispatching events forever
    ev_queue.dispatch_forever();

    return 0;
}

// This is called from RX_DONE, so whenever a message came in
static void receive_message()
{
    uint8_t rx_buffer[50] = { 0 };
    int16_t retcode;
    retcode = lorawan.receive(MBED_CONF_LORA_APP_PORT, rx_buffer,
                              sizeof(rx_buffer),
                              MSG_CONFIRMED_FLAG|MSG_UNCONFIRMED_FLAG);

    if (retcode < 0) {
        printf("receive() - Error code %d\n", retcode);
        return;
    }

    printf("Data received on port %d (length %d): ", MBED_CONF_LORA_APP_PORT, retcode);

    for (uint8_t i = 0; i < retcode; i++) {
        printf("%02x ", rx_buffer[i]);
    }
    printf("\n");
}

// Event handler
static void lora_event_handler(lorawan_event_t event) {
    loramac_protocol_params params;

    switch (event) {
        case CONNECTED:
            printf("Connection - Successful\n");
            break;
        case DISCONNECTED:
            ev_queue.break_dispatch();
            printf("Disconnected Successfully\n");
            break;
        case TX_DONE:
        {
            printf("Message Sent to Network Server\n");
            break;
        }
        case TX_TIMEOUT:
        case TX_ERROR:
        case TX_CRYPTO_ERROR:
        case TX_SCHEDULING_ERROR:
            printf("Transmission Error - EventCode = %d\n", event);
            break;
        case RX_DONE:
            printf("Received message from Network Server\n");
            receive_message();
            break;
        case RX_TIMEOUT:
        case RX_ERROR:
            printf("Error in reception - Code = %d\n", event);
            break;
        case JOIN_FAILURE:
            printf("OTAA Failed - Check Keys\n");
            break;
        default:
            MBED_ASSERT("Unknown Event");
            break;
    }
}
