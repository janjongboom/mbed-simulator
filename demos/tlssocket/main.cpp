#include "mbed.h"
#include "mbed_trace.h"
#include "NetworkInterface.h"
#include "TLSSocket.h"

/* List of trusted root CA certificates
 * currently one: Global Sign, the CA for os.mbed.com
 *
 * To add more root certificates, just concatenate them.
 */
const char SSL_CA_PEM[] = "-----BEGIN CERTIFICATE-----\n"
    "MIIDdTCCAl2gAwIBAgILBAAAAAABFUtaw5QwDQYJKoZIhvcNAQEFBQAwVzELMAkG\n"
    "A1UEBhMCQkUxGTAXBgNVBAoTEEdsb2JhbFNpZ24gbnYtc2ExEDAOBgNVBAsTB1Jv\n"
    "b3QgQ0ExGzAZBgNVBAMTEkdsb2JhbFNpZ24gUm9vdCBDQTAeFw05ODA5MDExMjAw\n"
    "MDBaFw0yODAxMjgxMjAwMDBaMFcxCzAJBgNVBAYTAkJFMRkwFwYDVQQKExBHbG9i\n"
    "YWxTaWduIG52LXNhMRAwDgYDVQQLEwdSb290IENBMRswGQYDVQQDExJHbG9iYWxT\n"
    "aWduIFJvb3QgQ0EwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDaDuaZ\n"
    "jc6j40+Kfvvxi4Mla+pIH/EqsLmVEQS98GPR4mdmzxzdzxtIK+6NiY6arymAZavp\n"
    "xy0Sy6scTHAHoT0KMM0VjU/43dSMUBUc71DuxC73/OlS8pF94G3VNTCOXkNz8kHp\n"
    "1Wrjsok6Vjk4bwY8iGlbKk3Fp1S4bInMm/k8yuX9ifUSPJJ4ltbcdG6TRGHRjcdG\n"
    "snUOhugZitVtbNV4FpWi6cgKOOvyJBNPc1STE4U6G7weNLWLBYy5d4ux2x8gkasJ\n"
    "U26Qzns3dLlwR5EiUWMWea6xrkEmCMgZK9FGqkjWZCrXgzT/LCrBbBlDSgeF59N8\n"
    "9iFo7+ryUp9/k5DPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNVHRMBAf8E\n"
    "BTADAQH/MB0GA1UdDgQWBBRge2YaRQ2XyolQL30EzTSo//z9SzANBgkqhkiG9w0B\n"
    "AQUFAAOCAQEA1nPnfE920I2/7LqivjTFKDK1fPxsnCwrvQmeU79rXqoRSLblCKOz\n"
    "yj1hTdNGCbM+w6DjY1Ub8rrvrTnhQ7k4o+YviiY776BQVvnGCv04zcQLcFGUl5gE\n"
    "38NflNUVyRRBnMRddWQVDf9VMOyGj/8N7yy5Y0b2qvzfvGn9LhJIZJrglfCm7ymP\n"
    "AbEVtQwdpf5pLGkkeB6zpxxxYu7KyJesF12KwvhHhm4qxFYxldBniYUr+WymXUad\n"
    "DKqC5JlR3XC321Y9YeRq4VzW9v493kHMB65jUr9TU/Qr6cf9tveCX4XSQRjbgbME\n"
    "HMUfpIBvFSDJ3gyICh3WZlXi/EjJKSZp4A==\n"
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
