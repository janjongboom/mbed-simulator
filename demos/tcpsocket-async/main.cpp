#include "mbed.h"
#include "mbed_shared_queues.h"
#include "NetworkInterface.h"
#include "TCPSocket.h"

static TCPSocket socket;
static char rx_buffer[256] = { 0 };

nsapi_size_or_error_t send_query() {
    const char *query = "GET / HTTP/1.1\r\nHost: api.ipify.org\r\n\r\n";

    return socket.send(query, strlen(query));
}

nsapi_size_or_error_t receive_data() {
    return socket.recv(rx_buffer, sizeof(rx_buffer));
}

void handle_socket_sigio()
{
    static enum {
        CONNECTING,
        SEND,
        RECEIVE,
        CLOSE,
        NONE
    } next_state = CONNECTING;

    printf("socket sigio, next_state=%d\n", next_state);

    switch (next_state) {
        case CONNECTING:
            switch(socket.connect("api.ipify.org", 80)) {
                case NSAPI_ERROR_IN_PROGRESS:
                    // Connecting to server
                    printf("Connecting to server\n");
                    break;
                case NSAPI_ERROR_ALREADY:
                case NSAPI_ERROR_OK:
                    // Now connected to server
                    next_state = SEND;
                    printf("Connected to server\n");
                    break;
                default:
                    // Error in connection phase
                    printf("Error in connection phase\n");
                    next_state = CLOSE;
            }
        case SEND:
            printf("Sending...\n");
            if (send_query() > 0)
                next_state = RECEIVE;
            else
                next_state = CLOSE; // Error
            break;
        case RECEIVE:
            if (receive_data() == NSAPI_ERROR_WOULD_BLOCK)
                break;

            printf("\nReceived:\n\n%s\n\n", rx_buffer);
            next_state = CLOSE;
        case CLOSE:
            printf("Socket close\n");
            next_state = NONE;
            socket.close();
            break;
    }
}

int main() {
    NetworkInterface *net = NetworkInterface::get_default_instance();
    net->connect();

    socket.open(net);

    socket.set_blocking(false);
    socket.sigio(&handle_socket_sigio);
    handle_socket_sigio();                   // Kick the state machine to start connecting

    wait(osWaitForever);
}
