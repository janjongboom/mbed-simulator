#include "mbed.h"
#include "mbed_trace.h"
#include "eventOS_scheduler.h"

/*
 * Copyright (c) 2015 ARM Limited. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 * Licensed under the Apache License, Version 2.0 (the License); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an AS IS BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
#ifndef __SECURITY_H__
#define __SECURITY_H__

#include <inttypes.h>

#define MBED_DOMAIN "fc5bae18-72d8-4d16-a0d0-00608fa76464"
#define MBED_ENDPOINT_NAME "3698a9cf-d4e4-43ea-bf0d-2a07e2b4f5d6"

const uint8_t SERVER_CERT[] = "-----BEGIN CERTIFICATE-----\r\n"
"MIIBmDCCAT6gAwIBAgIEVUCA0jAKBggqhkjOPQQDAjBLMQswCQYDVQQGEwJGSTEN\r\n"
"MAsGA1UEBwwET3VsdTEMMAoGA1UECgwDQVJNMQwwCgYDVQQLDANJb1QxETAPBgNV\r\n"
"BAMMCEFSTSBtYmVkMB4XDTE1MDQyOTA2NTc0OFoXDTE4MDQyOTA2NTc0OFowSzEL\r\n"
"MAkGA1UEBhMCRkkxDTALBgNVBAcMBE91bHUxDDAKBgNVBAoMA0FSTTEMMAoGA1UE\r\n"
"CwwDSW9UMREwDwYDVQQDDAhBUk0gbWJlZDBZMBMGByqGSM49AgEGCCqGSM49AwEH\r\n"
"A0IABLuAyLSk0mA3awgFR5mw2RHth47tRUO44q/RdzFZnLsAsd18Esxd5LCpcT9w\r\n"
"0tvNfBv4xJxGw0wcYrPDDb8/rjujEDAOMAwGA1UdEwQFMAMBAf8wCgYIKoZIzj0E\r\n"
"AwIDSAAwRQIhAPAonEAkwixlJiyYRQQWpXtkMZax+VlEiS201BG0PpAzAiBh2RsD\r\n"
"NxLKWwf4O7D6JasGBYf9+ZLwl0iaRjTjytO+Kw==\r\n"
"-----END CERTIFICATE-----\r\n";

const uint8_t CERT[] = "-----BEGIN CERTIFICATE-----\r\n"
"MIIBzjCCAXOgAwIBAgIERbdpgzAMBggqhkjOPQQDAgUAMDkxCzAJBgNVBAYTAkZ\r\n"
"JMQwwCgYDVQQKDANBUk0xHDAaBgNVBAMME21iZWQtY29ubmVjdG9yLTIwMTgwHh\r\n"
"cNMTcxMTIwMTM1MTIyWhcNMTgxMjMxMDYwMDAwWjCBoTFSMFAGA1UEAxNJZmM1Y\r\n"
"mFlMTgtNzJkOC00ZDE2LWEwZDAtMDA2MDhmYTc2NDY0LzM2OThhOWNmLWQ0ZTQt\r\n"
"NDNlYS1iZjBkLTJhMDdlMmI0ZjVkNjEMMAoGA1UECxMDQVJNMRIwEAYDVQQKEwl\r\n"
"tYmVkIHVzZXIxDTALBgNVBAcTBE91bHUxDTALBgNVBAgTBE91bHUxCzAJBgNVBA\r\n"
"YTAkZJMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE0ol1EuVf6zc1PBsJaBQLk\r\n"
"46Q3YIi2/pjSD8zw6R7PbP9VL/d62VxYTH4K+0mXQHT2q5wurhHS34GZgYFe7N6\r\n"
"GDAMBggqhkjOPQQDAgUAA0cAMEQCIGqRQustOHsGzu10UylzgDiwKgzBWdE9T77\r\n"
"do9crOm2/AiAWf0BagQtPo/J3Q2VI1g63FVLpVJdqx13HdUwSzZP3AQ==\r\n"
"-----END CERTIFICATE-----\r\n";

const uint8_t KEY[] = "-----BEGIN PRIVATE KEY-----\r\n"
"MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQggB5uULKnJBcU0zsh\r\n"
"hWqV4PRMy/KM+XAemNY/gl0s3ZGhRANCAATSiXUS5V/rNzU8GwloFAuTjpDdgiLb\r\n"
"+mNIPzPDpHs9s/1Uv93rZXFhMfgr7SZdAdParnC6uEdLfgZmBgV7s3oY\r\n"
"-----END PRIVATE KEY-----\r\n";

#endif //__SECURITY_H__

#include "simple-mbed-client.h"
#include "EthernetInterface.h"


SimpleMbedClient client;

// Declare peripherals
DigitalOut connectivityLed(LED2);                   // Blinks while connecting, turns solid when connected
DigitalOut augmentedLed(LED1, 0);     // LED that can be controlled through Connector
InterruptIn btn(BUTTON1);              // Button that sends it's count to Connector

Ticker connectivityTicker;

// Callback function when the pattern resource is updated
void patternUpdated(string v) {
    printf("New pattern: %s\n", v.c_str());
}

// Define resources here. They act as normal variables, but are exposed to the internet...
SimpleResourceInt btn_count = client.define_resource("button/0/clicks", 0, M2MBase::GET_ALLOWED);
SimpleResourceString pattern = client.define_resource("led/0/pattern", "500:500:500:500:500:500:500", &patternUpdated);

void fall() {
    btn_count = btn_count + 1;
    printf("Button count is now %d\r\n", static_cast<int>(btn_count));
}

void toggleConnectivityLed() {
    connectivityLed = !connectivityLed;
}

void registered() {
    printf("Registered\r\n");

    connectivityTicker.detach();
    connectivityLed = 1;
}

void play(void* args) {
    connectivityLed = 0;

    // Parse the pattern string, and toggle the LED in that pattern
    string s = static_cast<string>(pattern);
    size_t i = 0;
    size_t pos = s.find(':');
    while (pos != string::npos) {
        wait_ms(atoi(s.substr(i, pos - i).c_str()));
        augmentedLed = !augmentedLed;

        i = ++pos;
        pos = s.find(':', pos);

        if (pos == string::npos) {
            wait_ms(atoi(s.substr(i, s.length()).c_str()));
            augmentedLed = !augmentedLed;
        }
    }

    augmentedLed = 0;
    connectivityLed = 1;
}

Ticker blah;

int main() {
    blah.attach_us(&eventOS_scheduler_run_until_idle, 100000);

    mbed_trace_init();       // initialize the trace library

    // Handle button fall event
    btn.fall(&fall);

    // Toggle the built-in LED every second (until we're connected, see `registered` function)
    connectivityTicker.attach(&toggleConnectivityLed, 1.0f);

    // Functions can be executed through mbed Device Connector via POST calls (also defer to the event thread, so we never block)
    client.define_function("led/0/play", &play);

    // Connect to the internet
    EthernetInterface network;
    if (network.connect() != 0) {
        printf("Failed to connect to network...\n");
        return 1;
    }

    // Connect to mbed Device Connector
    struct MbedClientOptions opts = client.get_default_options(); // opts contains information like the DeviceType
    bool setup = client.setup(opts, &network);
    if (!setup) {
        printf("Client setup failed\n");
        return 1;
    }
    client.on_registered(&registered);
}
