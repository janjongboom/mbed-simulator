#include "mbed.h"
#include "mbed_trace.h"
#include "NetworkInterface.h"
#include "TLSSocket.h"

/* List of trusted root CA certificates
 * currently one: Starfield Technologies, the CA for os.mbed.com
 *
 * To add more root certificates, just concatenate them.
 */
const char SSL_CA_PEM[] = "-----BEGIN CERTIFICATE-----\n"
    "MIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF\n"
    "ADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6\n"
    "b24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL\n"
    "MAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJv\n"
    "b3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXj\n"
    "ca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM\n"
    "9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qw\n"
    "IFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6\n"
    "VOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L\n"
    "93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQm\n"
    "jgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC\n"
    "AYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUA\n"
    "A4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDI\n"
    "U5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUs\n"
    "N+gDS63pYaACbvXy8MWy7Vu33PqUXHeeE6V/Uq2V8viTO96LXFvKWlJbYK8U90vv\n"
    "o/ufQJVtMVT8QtPHRh8jrdkPSHCa2XV4cdFyQzR1bldZwgJcJmApzyMZFo6IQ6XU\n"
    "5MsI+yMRQ+hDKXJioaldXgjUkK642M4UwtBV8ob2xJNDd2ZhwLnoQdeXeGADbkpy\n"
    "rqXRfboQnoZsG4q5WTP468SQvvG5\n"
    "-----END CERTIFICATE-----\n";

int main() {
    /**
     * Note that we have an actual HTTP/HTTPS library, see http/https examples
     */

    NetworkInterface *network = NetworkInterface::get_default_instance();
    if (network->connect() != 0) {
        printf("Could not connect to the network...\n");
        return 1;
    }

    // comment this line out to disable the TLS socket logging
    mbed_trace_init();

    printf("Setting up TLS socket...\n");

    nsapi_error_t r;

    // setting up TLS socket
    TLSSocket* socket = new TLSSocket();
    if ((r = socket->open(network)) != NSAPI_ERROR_OK) {
        printf("TLS socket open failed (%d)\n", r);
        return 1;
    }
    if ((r = socket->set_root_ca_cert(SSL_CA_PEM)) != NSAPI_ERROR_OK) {
        printf("TLS socket set_root_ca_cert failed (%d)\n", r);
        return 1;
    }
    if ((r = socket->connect("os.mbed.com", 443)) != NSAPI_ERROR_OK) {
        printf("TLS socket connect failed (%d)\n", r);
        return 1;
    }

    printf("TLS Socket is connected\n");

    // Send a simple http request
    char send_buffer[] = "GET /media/uploads/mbed_official/hello.txt HTTP/1.1\r\nHost: os.mbed.com\r\n\r\n";
    int scount = socket->send(send_buffer, strlen(send_buffer));
    printf("\nSent %d bytes:\n\n%s\n\n", scount, send_buffer);

    // Recieve an HTTP response and print out the response line
    char recv_buffer[1024] = { 0 };
    int rcount = socket->recv(recv_buffer, 1024);
    printf("\nReceived %d bytes:\n\n%s\n\n", rcount, recv_buffer);

    socket->close();
    delete socket;

    wait(osWaitForever);
}
