#include "mbed.h"
// #include "mbed_shared_queues.h"
#include "NetworkInterface.h"
#include "TCPSocket.h"

// nsapi_size_or_error_t send_query(TCPSocket *socket) {
//     return socket->send(QUERY, QUERY_LEN);
// }

// nsapi_size_or_error_t receive_data(TCPSocket *socket) {
//     // Simplified example, does not properly handle streaming and appending to buffer
//     return socket->recv(my_buffer, remaining_len);
// }

// void handle_socket_sigio(TCPSocket *socket)
// {
//     static enum {
//         CONNECTING,
//         SEND,
//         RECEIVE,
//         CLOSE,
//     } next_state = CONNECTING;

//     switch (next_state) {
//         case CONNECTING:
//             switch(socket->connect("api.ipify.org", 80)) {
//                 case NSAPI_ERROR_IN_PROGRESS:
//                     // Connecting to server
//                     break;
//                 case NSAPI_ERROR_ALREADY:
//                     // Now connected to server
//                     next_state = SEND;
//                     break;
//                 default:
//                     // Error in connection phase
//                     next_state = CLOSE;
//             }
//         case SEND:
//             if (send_query(socket) > 0)
//                 next_state = RECEIVE;
//             else
//                 next_state = CLOSE; // Error
//             break;
//         case RECEIVE:
//             if (receive_data(socket) == NSAPI_ERROR_WOULD_BLOCK)
//                 break;
//             next_state = CLOSE;
//             break;
//         case CLOSE:
//             socket->close();
//             break;
//     }
// }

int main() {
    NetworkInterface *net = NetworkInterface::get_default_instance();
    net->connect();

    TCPSocket socket;
    socket.open(net);

    // EventQueue *queue = mbed_event_queue();

    // Event<void()> handler = queue->event(handle_socket_sigio, &socket);

    // socket.set_blocking(false);
    // socket.sigio(handler);
    // handler();                   // Kick the state machine to start connecting
}