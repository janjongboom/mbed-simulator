#include <string>
#include "mbed.h"
#include "EthernetInterface.h"
#include "sn_coap_protocol.h"
#include "sn_coap_header.h"
#include "UDPSocket.h"

UDPSocket coap_socket;           // Socket to talk CoAP over

struct coap_s* coapHandle;
coap_version_e coapVersion = COAP_VERSION_1;

// CoAP HAL
void* coap_malloc(uint16_t size) {
    return malloc(size);
}

void coap_free(void* addr) {
    free(addr);
}

// tx_cb and rx_cb are not used in this program
uint8_t coap_tx_cb(uint8_t *a, uint16_t b, sn_nsdl_addr_s *c, void *d) {
    printf("coap tx cb\n");
    return 0;
}

int8_t coap_rx_cb(sn_coap_hdr_s *a, sn_nsdl_addr_s *b, void *c) {
    printf("coap rx cb\n");
    return 0;
}

// Receive a CoAP message (you would run this in a separate thread normally, but we don't have it in the simulator)
void recv_coap_message() {
    SocketAddress addr;
    uint8_t* recv_buffer = (uint8_t*)malloc(1280); // Suggested is to keep packet size under 1280 bytes

    nsapi_size_or_error_t ret = coap_socket.recvfrom(&addr, recv_buffer, 1280);
    if (ret > 0) {
        // to see where the message came from, inspect addr.get_addr() and addr.get_port()

        printf("Received a message of length '%d'\n", ret);

        sn_coap_hdr_s* parsed = sn_coap_parser(coapHandle, ret, recv_buffer, &coapVersion);

        // We know the payload is going to be a string
        std::string payload((const char*)parsed->payload_ptr, parsed->payload_len);

        printf("\tmsg_id:           %d\n", parsed->msg_id);
        printf("\tmsg_code:         %d\n", parsed->msg_code);
        printf("\tcontent_format:   %d\n", parsed->content_format);
        printf("\tpayload_len:      %d\n", parsed->payload_len);
        printf("\tpayload:          %s\n", payload.c_str());
        printf("\toptions_list_ptr: %p\n", parsed->options_list_ptr);
    }
    else {
        printf("Failed to receive message (%d)\n", ret);
    }

    free(recv_buffer);
}

int main() {
    NetworkInterface *network = NetworkInterface::get_default_instance();
    if (network->connect() != 0) {
        printf("Cannot connect to the network, see serial output\n");
        return 1;
    }

    printf("Connected to the network. Opening a socket...\n");

    // Open a socket on the network interface
    coap_socket.open(network);

    // Initialize the CoAP protocol handle, pointing to local implementations on malloc/free/tx/rx functions
    coapHandle = sn_coap_protocol_init(&coap_malloc, &coap_free, &coap_tx_cb, &coap_rx_cb);

    // Path to the resource we want to retrieve
    const char* coap_uri_path = "/hello";

    // See ns_coap_header.h
    sn_coap_hdr_s *coap_res_ptr = (sn_coap_hdr_s*)calloc(sizeof(sn_coap_hdr_s), 1);
    coap_res_ptr->uri_path_ptr = (uint8_t*)coap_uri_path;       // Path
    coap_res_ptr->uri_path_len = strlen(coap_uri_path);
    coap_res_ptr->msg_code = COAP_MSG_CODE_REQUEST_GET;         // CoAP method
    coap_res_ptr->content_format = COAP_CT_TEXT_PLAIN;          // CoAP content type
    coap_res_ptr->payload_len = 0;                              // Body length
    coap_res_ptr->payload_ptr = 0;                              // Body pointer
    coap_res_ptr->options_list_ptr = 0;                         // Optional: options list
    // Message ID is used to track request->response patterns, because we're using UDP (so everything is unconfirmed).
    // See the receive code to verify that we get the same message ID back
    coap_res_ptr->msg_id = 7;

    // Calculate the CoAP message size, allocate the memory and build the message
    uint16_t message_len = sn_coap_builder_calc_needed_packet_data_size(coap_res_ptr);
    printf("Calculated message length: %d bytes\n", message_len);

    uint8_t* message_ptr = (uint8_t*)malloc(message_len);
    sn_coap_builder(message_ptr, coap_res_ptr);

    // Uncomment to see the raw buffer that will be sent...
    // printf("Message is: ");
    // for (size_t ix = 0; ix < message_len; ix++) {
    //     printf("%02x ", message_ptr[ix]);
    // }
    // printf("\n");

    int scount = coap_socket.sendto("coap.me", 5683, message_ptr, message_len);
    printf("Sent %d bytes to coap://coap.me:5683 (path=%s)\n", scount, coap_uri_path);

    recv_coap_message();

    free(coap_res_ptr);
    free(message_ptr);

    printf("Done!\n");

    wait(osWaitForever);
}
