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

#ifndef __SIMPLE_MBED_CLIENT_H__
#define __SIMPLE_MBED_CLIENT_H__

#define smc_debug_msg(...) if (debug) printf(__VA_ARGS__)

#include <map>
#include <string>
#include <vector>
#include "mbed-client-wrapper.h"

#ifndef MBED_CONF_SIMPLE_MBED_CLIENT_UPDATE_INTERVAL
#define MBED_CONF_SIMPLE_MBED_CLIENT_UPDATE_INTERVAL 25000
#endif

using namespace std;

class SimpleResourceBase {
public:
    virtual void update(string v) {}
    virtual void clear_pending_value() {}
};

class SimpleMbedClientBase {
public:

    SimpleMbedClientBase(bool aDebug = true)
        : debug(aDebug)
    {
    }

    ~SimpleMbedClientBase() {

    }

    struct MbedClientOptions get_default_options() {
        struct MbedClientOptions options;
        options.Manufacturer = "Manufacturer_String";
        options.Type = "Type_String";
        options.ModelNumber = "ModelNumber_String";
        options.SerialNumber = "SerialNumber_String";
        options.DeviceType = "test";
        options.SocketMode = M2MInterface::TCP;
#ifdef MBED_SERVER_ADDRESS
        options.ServerAddress = MBED_SERVER_ADDRESS;
#else
        options.ServerAddress = "coap://api.connector.mbed.com:5684";
#endif

        return options;
    }

    bool init(NetworkInterface* iface) {
        smc_debug_msg("[SMC] Device name %s\r\n", MBED_ENDPOINT_NAME);

        // Create endpoint interface to manage register and unregister
        client->create_interface(iface);

        // Create Objects of varying types, see simpleclient.h for more details on implementation.
        M2MSecurity* register_object = client->create_register_object(); // server object specifying connector info
        M2MDevice*   device_object   = client->create_device_object();   // device resources object

        // Create list of Objects to register
        M2MObjectList object_list;

        // Add objects to list
        object_list.push_back(device_object);

        map<string, M2MObject*>::iterator it;
        for (it = objects.begin(); it != objects.end(); it++)
        {
            object_list.push_back(it->second);
        }

        // Set endpoint registration object
        client->set_register_object(register_object);

        // Issue register command.
        client->test_register(register_object, object_list);

        // Keep alive ticker (every 25 seconds)
        // updateTicker.attach(callback(this, &SimpleMbedClientBase::keep_alive), MBED_CONF_SIMPLE_MBED_CLIENT_UPDATE_INTERVAL);

        return true;
    }

    bool setup(NetworkInterface* iface) {
        smc_debug_msg("[SMC] In mbed_client_setup\r\n");
        if (client) {
            smc_debug_msg("[SMC] [ERROR] mbed_client_setup called, but mbed_client is already instantiated\r\n");
            return false;
        }

        struct MbedClientOptions options = get_default_options();

        Callback<void(string)> updateFp(this, &SimpleMbedClientBase::resource_updated);
        client = new MbedClient(options, updateFp, debug);

        return init(iface);
    }

    bool setup(MbedClientOptions options, NetworkInterface* iface) {
        if (client) {
            smc_debug_msg("[SMC] [ERROR] mbed_client_setup called, but mbed_client is already instantiated\r\n");
            return false;
        }

        Callback<void(string)> updateFp(this, &SimpleMbedClientBase::resource_updated);
        client = new MbedClient(options, updateFp, debug);

        return init(iface);
    }

    void on_registered(void(*fn)(void)) {
        Callback<void()> fp(fn);
        client->set_registered_function(fp);
    }

    void on_registered(Callback<void()> fp) {
        client->set_registered_function(fp);
    }

    template<typename T>
    void on_registered(T *object, void (T::*member)(void)) {
        Callback<void()> fp(object, member);
        client->set_registered_function(fp);
    }

    void on_unregistered(void(*fn)(void)) {
        Callback<void()> fp(fn);
        client->set_unregistered_function(fp);
    }

    void on_unregistered(Callback<void()> fp) {
        client->set_unregistered_function(fp);
    }

    template<typename T>
    void on_unregistered(T *object, void (T::*member)(void)) {
        Callback<void()> fp(object, member);
        client->set_unregistered_function(fp);
    }

    bool define_function(const char* route, Callback<void(void*)> ev) {
        if (!define_resource_internal(route, string(), M2MBase::POST_ALLOWED, false)) {
            return false;
        }

        string route_str(route);
        if (!resources.count(route_str)) {
            smc_debug_msg("[SMC] [ERROR] Should be created, but no such route (%s)\r\n", route);
            return false;
        }

        // We need a copy of the event. The original event might go out of scope.
        // @todo, do we need to clear this? It's actually meant to live until the end of the program... But it's not nice to alloc and never free.
        Callback<void(void*)>* copy = new Callback<void(void*)>(ev);

        // Callback::call is const, which FP1 does not like. Cast it to non-const.
        FP1<void, void*> fp(copy, (void (Callback<void(void*)>::*)(void*))&Callback<void(void*)>::call);

        resources[route_str]->set_execute_function(fp);
        return true;
    }

    bool define_function(const char* route, void(*fn)(void*)) {
        if (!define_resource_internal(route, string(), M2MBase::POST_ALLOWED, false)) {
            return false;
        }

        string route_str(route);
        if (!resources.count(route_str)) {
            smc_debug_msg("[SMC] [ERROR] Should be created, but no such route (%s)\r\n", route);
            return false;
        }

        resources[route_str]->set_execute_function(execute_callback_2(fn));
        return true;
    }

    bool define_function(const char* route, execute_callback fn) {
        if (!define_resource_internal(route, string(), M2MBase::POST_ALLOWED, false)) {
            return false;
        }

        string route_str(route);
        if (!resources.count(route_str)) {
            smc_debug_msg("[SMC] [ERROR] Should be created, but no such route (%s)\r\n", route);
            return false;
        }
        // No clue why this is not working?! It works with class member, but not with static function...
        resources[route_str]->set_execute_function(fn);
        return true;
    }

    string get(string route_str) {
        if (!resources.count(route_str)) {
            smc_debug_msg("[SMC] [ERROR] No such route (%s)\r\n", route_str.c_str());
            return string();
        }

        // otherwise ask mbed Client...
        uint8_t* buffIn = NULL;
        uint32_t sizeIn;
        resources[route_str]->get_value(buffIn, sizeIn);

        string s((char*)buffIn, sizeIn);
        return s;
    }

    // Note: these `set` calls are async.
    // SimpleResource* buffers the value, so when using it through operators you'll get the right value back.
    void set(string route_str, string v) {
        internal_set_str(route_str, v);
    }

    void set(string route_str, const int& v) {
        internal_set_int(route_str, v);
    }

    void set(string route_str, const float& v) {
        internal_set_float(route_str, v);
    }

    bool define_resource_internal(const char* route, string v, M2MBase::Operation opr, bool observable) {
        if (client) {
            smc_debug_msg("[SMC] [ERROR] mbed_client_define_resource, Can only define resources before mbed_client_setup is called!\r\n");
            return false;
        }

        vector<string> segments = parse_route(route);
        if (segments.size() != 3) {
            smc_debug_msg("[SMC] [ERROR] mbed_client_define_resource, Route needs to have three segments, split by '/' (%s)\r\n", route);
            return false;
        }

        // segments[1] should be one digit and numeric
        char n = segments.at(1).c_str()[0];
        if (n < '0' || n > '9') {
            smc_debug_msg("[SMC] [ERROR] mbed_client_define_resource, second route segment should be numeric, but was not (%s)\r\n", route);
            return false;
        }

        int inst_id = atoi(segments.at(1).c_str());

        M2MObjectInstance* inst;
        if (objectInstances.count(segments.at(0))) {
            inst = objectInstances[segments.at(0)];
        }
        else {
            M2MObject* obj = M2MInterfaceFactory::create_object(segments.at(0).c_str());
            inst = obj->create_object_instance(inst_id);
            objects.insert(std::pair<string, M2MObject*>(segments.at(0), obj));
            objectInstances.insert(std::pair<string, M2MObjectInstance*>(segments.at(0), inst));
        }

        // @todo check if the resource exists yet
        M2MResource* res = inst->create_dynamic_resource(segments.at(2).c_str(), "",
            M2MResourceInstance::STRING, observable);
        res->set_operation(opr);
        res->set_value((uint8_t*)v.c_str(), v.length());

        string route_str(route);
        resources.insert(pair<string, M2MResource*>(route_str, res));

        return true;
    }

    void register_update_callback(string route, SimpleResourceBase* simpleResource) {
        updateValues[route] = simpleResource;
    }

    M2MResource* get_resource(string route) {
        if (!resources.count(route)) {
            smc_debug_msg("[SMC] [ERROR] No such route (%s)\r\n", route.c_str());
            return NULL;
        }

        return resources[route];
    }

private:
    vector<string> parse_route(const char* route) {
        const string s(route);
        vector<string> v;

        split(s, '/', v);

        return v;
    }

    void split(const string& s, char delim, vector<string>& v) {
        size_t i = 0;
        size_t pos = s.find(delim);
        while (pos != string::npos) {
            v.push_back(s.substr(i, pos - i));
            i = ++pos;
            pos = s.find(delim, pos);

            if (pos == string::npos) {
                v.push_back(s.substr(i, s.length()));
            }
        }
    }

    void resource_updated(string uri) {
        if (updateValues.count(uri) == 0) return;

        string v = get(uri);
        if (v.empty()) return;

        // Schedule this on the other thread, to avoid blocking this thread
        updateValues[uri]->update(v);
    }

    // These operations have side effects, they should not be called immediately,
    // but always through the eventqueue
    void internal_set_str(string route_str, string v) {
        if (!resources.count(route_str)) {
            smc_debug_msg("[SMC] [ERROR] No such route (%s)\r\n", route_str.c_str());
            return;
        }

        if (v.length() == 0) {
            resources[route_str]->clear_value();
        }
        else {
            resources[route_str]->set_value((uint8_t*)v.c_str(), v.length());
        }

        updateValues[route_str]->clear_pending_value();
    }

    void internal_set_int(string route, const int& v) {
        char str[13];
        sprintf(str, "%d", v);

        internal_set_str(route, string(str));
    }

    void internal_set_float(string route, const float& v) {
        int size = snprintf(NULL, 0, "%g", v);

        char str[size];
        sprintf(str, "%g", v);

        internal_set_str(route, string(str));
    }

    void keep_alive() {
        client->test_update_register();
    }

    MbedClient* client;
    map<string, M2MObject*> objects;
    map<string, M2MObjectInstance*> objectInstances;
    map<string, M2MResource*> resources;

    Ticker updateTicker;

    bool debug;

    map<string, SimpleResourceBase*> updateValues;
};

class SimpleResourceString : public SimpleResourceBase {
public:
    SimpleResourceString(SimpleMbedClientBase* aSimpleClient, string aRoute, Callback<void(string)> aOnUpdate) :
        simpleClient(aSimpleClient), route(aRoute), onUpdate(aOnUpdate), hasPendingValue(false) {}

    string operator=(const string& newValue) {
        pendingValue = newValue;
        hasPendingValue = true;

        simpleClient->set(route, newValue);
        return newValue;
    };

    operator string() const {
        if (hasPendingValue) {
            return pendingValue;
        }

        return simpleClient->get(route);
    };

    virtual void update(string v) {
        if (onUpdate) onUpdate(v);
    }

    M2MResource* get_resource() {
        return simpleClient->get_resource(route);
    }

    virtual void clear_pending_value() {
        hasPendingValue = false;
    }

private:
    SimpleMbedClientBase* simpleClient;
    string route;
    Callback<void(string)> onUpdate;

    // set() is async (because on the event queue, so store the pending value here...)
    bool hasPendingValue;
    string pendingValue;
};

class SimpleResourceInt : public SimpleResourceBase {
public:
    SimpleResourceInt(SimpleMbedClientBase* aSimpleClient, string aRoute, Callback<void(int)> aOnUpdate) :
        simpleClient(aSimpleClient), route(aRoute), onUpdate(aOnUpdate), hasPendingValue(false), pendingValue(0) {}

    int operator=(int newValue) {
        pendingValue = newValue;
        hasPendingValue = true;

        simpleClient->set(route, newValue);
        return newValue;
    };
    operator int() const {
        if (hasPendingValue) {
            return pendingValue;
        }

        string v = simpleClient->get(route);
        if (v.empty()) return 0;

        return atoi((const char*)v.c_str());
    };

    virtual void update(string v) {
        if (!onUpdate) return;

        onUpdate(atoi((const char*)v.c_str()));
    }

    M2MResource* get_resource() {
        return simpleClient->get_resource(route);
    }

    virtual void clear_pending_value() {
        hasPendingValue = false;
    }

private:
    SimpleMbedClientBase* simpleClient;
    string route;
    Callback<void(int)> onUpdate;

    // set() is async (because on the event queue, so store the pending value here...)
    bool hasPendingValue;
    int pendingValue;
};

class SimpleResourceFloat : public SimpleResourceBase {
public:
    SimpleResourceFloat(SimpleMbedClientBase* aSimpleClient, string aRoute, Callback<void(float)> aOnUpdate) :
        simpleClient(aSimpleClient), route(aRoute), onUpdate(aOnUpdate), hasPendingValue(false), pendingValue(0) {}

    float operator=(float newValue) {
        pendingValue = newValue;
        hasPendingValue = true;

        simpleClient->set(route, newValue);
        return newValue;
    };
    operator float() const {
        if (hasPendingValue) {
            return pendingValue;
        }

        string v = simpleClient->get(route);
        if (v.empty()) return 0;

        return atof((const char*)v.c_str());
    };

    virtual void update(string v) {
        if (!onUpdate) return;

        onUpdate(atof((const char*)v.c_str()));
    }

    M2MResource* get_resource() {
        return simpleClient->get_resource(route);
    }

    virtual void clear_pending_value() {
        hasPendingValue = false;
    }

private:
    SimpleMbedClientBase* simpleClient;
    string route;
    Callback<void(float)> onUpdate;

    // set() is async (because on the event queue, so store the pending value here...)
    bool hasPendingValue;
    float pendingValue;
};

class SimpleMbedClient : public SimpleMbedClientBase {
public:

    SimpleMbedClient(bool aDebug = true)
        : SimpleMbedClientBase(aDebug)
    {

    }
    // @todo: macro this up

    // String
    SimpleResourceString define_resource(
        const char* route,
        string v,
        M2MBase::Operation opr = M2MBase::GET_PUT_ALLOWED,
        bool observable = true,
        Callback<void(string)> onUpdate = NULL)
    {
        SimpleResourceString* simpleResource = new SimpleResourceString(this, route, onUpdate);
        bool res = define_resource_internal(route, v, opr, observable);
        if (!res) {
            printf("Error while creating %s\n", route);
        }
        else {
            register_update_callback(route, simpleResource);
        }
        return *simpleResource;
    }

    SimpleResourceString define_resource(
        const char* route,
        string v,
        M2MBase::Operation opr,
        bool observable,
        void(*onUpdate)(string))
    {
        Callback<void(string)> fp;
        fp.attach(onUpdate);
        return define_resource(route, v, opr, observable, fp);
    }

    SimpleResourceString define_resource(
        const char* route,
        string v,
        Callback<void(string)> onUpdate)
    {
        return define_resource(route, v, M2MBase::GET_PUT_ALLOWED, true, onUpdate);
    }

    SimpleResourceString define_resource(
        const char* route,
        string v,
        void(*onUpdate)(string))
    {
        Callback<void(string)> fp;
        fp.attach(onUpdate);
        return define_resource(route, v, M2MBase::GET_PUT_ALLOWED, true, fp);
    }

    // Int
    SimpleResourceInt define_resource(
        const char* route,
        int v,
        M2MBase::Operation opr = M2MBase::GET_PUT_ALLOWED,
        bool observable = true,
        Callback<void(int)> onUpdate = NULL)
    {
        SimpleResourceInt* simpleResource = new SimpleResourceInt(this, route, onUpdate);

        char str[13];
        sprintf(str, "%d", v);

        bool res = define_resource_internal(route, string(str), opr, observable);
        if (!res) {
            printf("Error while creating %s\n", route);
        }
        else {
            register_update_callback(route, simpleResource);
        }
        return *simpleResource;
    }

    SimpleResourceInt define_resource(
        const char* route,
        int v,
        M2MBase::Operation opr,
        bool observable,
        void(*onUpdate)(int))
    {
        Callback<void(int)> fp;
        fp.attach(onUpdate);
        return define_resource(route, v, opr, observable, fp);
    }

    SimpleResourceInt define_resource(
        const char* route,
        int v,
        Callback<void(int)> onUpdate)
    {
        return define_resource(route, v, M2MBase::GET_PUT_ALLOWED, true, onUpdate);
    }

    SimpleResourceInt define_resource(
        const char* route,
        int v,
        void(*onUpdate)(int))
    {
        Callback<void(int)> fp;
        fp.attach(onUpdate);
        return define_resource(route, v, M2MBase::GET_PUT_ALLOWED, true, fp);
    }

    // Float
    SimpleResourceFloat define_resource(
        const char* route,
        float v,
        M2MBase::Operation opr = M2MBase::GET_PUT_ALLOWED,
        bool observable = true,
        Callback<void(float)> onUpdate = NULL)
    {
        SimpleResourceFloat* simpleResource = new SimpleResourceFloat(this, route, onUpdate);

        int size = snprintf(NULL, 0, "%g", v);

        // malloc() would probably be better here
        char str[size];
        sprintf(str, "%g", v);

        bool res = define_resource_internal(route, string(str), opr, observable);
        if (!res) {
            printf("Error while creating %s\n", route);
        }
        else {
            register_update_callback(route, simpleResource);
        }
        return *simpleResource;
    }

    SimpleResourceFloat define_resource(
        const char* route,
        float v,
        M2MBase::Operation opr,
        bool observable,
        void(*onUpdate)(float))
    {
        Callback<void(float)> fp;
        fp.attach(onUpdate);
        return define_resource(route, v, opr, observable, fp);
    }

    SimpleResourceFloat define_resource(
        const char* route,
        float v,
        Callback<void(float)> onUpdate)
    {
        return define_resource(route, v, M2MBase::GET_PUT_ALLOWED, true, onUpdate);
    }

    SimpleResourceFloat define_resource(
        const char* route,
        float v,
        void(*onUpdate)(float))
    {
        Callback<void(float)> fp;
        fp.attach(onUpdate);
        return define_resource(route, v, M2MBase::GET_PUT_ALLOWED, true, fp);
    }
};

#endif // __SIMPLE_MBED_CLIENT_H__
