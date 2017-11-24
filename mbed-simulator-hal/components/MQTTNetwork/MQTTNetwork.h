#ifndef _MQTTNETWORK_H_
#define _MQTTNETWORK_H_

#include "mbed.h"
#include "NetworkInterface.h"

class MQTTNetwork {
public:
    MQTTNetwork(NetworkInterface* aNetwork) : network(aNetwork) {
        socket = new TCPSocket();
    }

    ~MQTTNetwork() {
        delete socket;
    }

    int read(unsigned char* buffer, int len, int timeout) {
        return socket->recv(buffer, len);
    }

    int write(unsigned char* buffer, int len, int timeout) {
        return socket->send(buffer, len);
    }

    int connect(const char* hostname, int port) {
        socket->open(network);
        return socket->connect(hostname, port);
    }

    int disconnect() {
        return socket->close();
    }

private:
    NetworkInterface* network;
    TCPSocket* socket;
};

#endif // _MQTTNETWORK_H_
