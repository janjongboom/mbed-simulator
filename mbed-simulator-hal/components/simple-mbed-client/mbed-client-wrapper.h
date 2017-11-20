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

#ifndef __SIMPLE_MBED_CLIENT_WRAPPER_H__
#define __SIMPLE_MBED_CLIENT_WRAPPER_H__

#include <time.h>
#include "mbed-client/m2minterfacefactory.h"
#include "mbed-client/m2mdevice.h"
#include "mbed-client/m2minterfaceobserver.h"
#include "mbed-client/m2minterface.h"
#include "mbed-client/m2mobjectinstance.h"
#include "mbed-client/m2mresource.h"

struct MbedClientOptions {
    const char* Manufacturer;
    const char* Type;
    const char* ModelNumber;
    const char* SerialNumber;
    const char* DeviceType;
    M2MInterface::BindingMode SocketMode;
    const char* ServerAddress;
};

/*
* Wrapper for mbed client stack that handles all callbacks, error handling, and
* other schenanigans to make the mbed client stack easier to use.
*
* The end user should only have to care about configuring the parameters at the
* top of this file and making sure they add the security.h file correctly.
* To add resources you can copy the _TODO__ function and add as many instances as
* you want.
*
*/
class MbedClient: public M2MInterfaceObserver {
public:
    // constructor for MbedClient object, initialize private variables
    MbedClient(struct MbedClientOptions options, Callback<void(std::string)> onValueChanged, bool debug) :
        _onValueChanged(onValueChanged), _debug(debug)
    {
        _interface = NULL;
        _bootstrapped = false;
        _error = false;
        _registered = false;
        _unregistered = false;
        _register_security = NULL;
        _value = 0;
        _object = NULL;
        _options = options;
        _onRegistered = NULL;
        _onUnregistered = NULL;
    }

    // de-constructor for MbedClient object, you can ignore this
    ~MbedClient() {
        if(_interface) {
            delete _interface;
        }
        if(_register_security){
            delete _register_security;
        }
    }

    // debug printf function
    void trace_printer(const char* str) {
        if (_debug) printf("[SMC] %s\r\n", str);
    }

    void set_registered_function(Callback<void()> onRegistered) {
        _onRegistered = onRegistered;
    }

    void set_unregistered_function(Callback<void()> onUnregistered) {
        _onUnregistered = onUnregistered;
    }

    /*
    *  Creates M2MInterface using which endpoint can
    *  setup its name, resource type, life time, connection mode,
    *  Currently only LwIPv4 is supported.
    */
    void create_interface(NetworkInterface* iface) {
        // Randomizing listening port for Certificate mode connectivity
        srand(time(NULL));
        uint16_t port = rand() % 65535 + 12345;

        // create mDS interface object, this is the base object everything else attaches to
        _interface = M2MInterfaceFactory::create_interface(*this,
                                                          MBED_ENDPOINT_NAME,       // endpoint name string
                                                          _options.DeviceType,      // endpoint type string
                                                          100,                      // lifetime
                                                          port,                     // listen port
                                                          MBED_DOMAIN,              // domain string
                                                          _options.SocketMode,      // binding mode
                                                          M2MInterface::LwIP_IPv4,  // network stack
                                                          "");                      // context address string

        _interface->set_platform_network_handler((void*)iface);
    }

    /*
    *  check private variable to see if the registration was sucessful or not
    */
    bool register_successful() {
        return _registered;
    }

    /*
    *  check private variable to see if un-registration was sucessful or not
    */
    bool unregister_successful() {
        return _unregistered;
    }

    /*
    *  Creates register server object with mbed device server address and other parameters
    *  required for client to connect to mbed device server.
    */
    M2MSecurity* create_register_object() {
        // create security object using the interface factory.
        // this will generate a security ObjectID and ObjectInstance
        M2MSecurity *security = M2MInterfaceFactory::create_security(M2MSecurity::M2MServer);

        // make sure security ObjectID/ObjectInstance was created successfully
        if(security) {
            // Add ResourceID's and values to the security ObjectID/ObjectInstance
            security->set_resource_value(M2MSecurity::M2MServerUri, _options.ServerAddress);
            security->set_resource_value(M2MSecurity::SecurityMode, M2MSecurity::Certificate);
            security->set_resource_value(M2MSecurity::ServerPublicKey, SERVER_CERT, sizeof(SERVER_CERT));
            security->set_resource_value(M2MSecurity::PublicKey, CERT, sizeof(CERT));
            security->set_resource_value(M2MSecurity::Secretkey, KEY, sizeof(KEY));
        }
        return security;
    }

    /*
    * Creates device object which contains mandatory resources linked with
    * device endpoint.
    */
    M2MDevice* create_device_object() {
        // create device objectID/ObjectInstance
        M2MDevice *device = M2MInterfaceFactory::create_device();
        // make sure device object was created successfully
        if(device) {
            // add resourceID's to device objectID/ObjectInstance
            device->create_resource(M2MDevice::Manufacturer, _options.Manufacturer);
            device->create_resource(M2MDevice::DeviceType, _options.Type);
            device->create_resource(M2MDevice::ModelNumber, _options.ModelNumber);
            device->create_resource(M2MDevice::SerialNumber, _options.SerialNumber);
        }
        return device;
    }

    /*
    * register an object
    */
    void test_register(M2MSecurity *register_object, M2MObjectList object_list){
        if(_interface) {
            // Register function
            _interface->register_object(register_object, object_list);
            _registered = true;
        }
    }

    /*
    * unregister all objects
    */
    void test_unregister() {
        if(_interface) {
            // Unregister function
            _interface->unregister_object(NULL); // NULL will unregister all objects
        }
    }

    //Callback from mbed client stack when the bootstrap
    // is successful, it returns the mbed Device Server object
    // which will be used for registering the resources to
    // mbed Device server.
    virtual void bootstrap_done(M2MSecurity *server_object){
        if(server_object) {
            _bootstrapped = true;
            _error = false;
            trace_printer("Bootstrapped");
        }
    }

    //Callback from mbed client stack when the registration
    // is successful, it returns the mbed Device Server object
    // to which the resources are registered and registered objects.
    virtual void object_registered(M2MSecurity */*security_object*/, const M2MServer &/*server_object*/){
        _registered = true;
        _unregistered = false;
        trace_printer("Registered object successfully!");

        if (_onRegistered) {
            _onRegistered.call();
        }
    }

    //Callback from mbed client stack when the unregistration
    // is successful, it returns the mbed Device Server object
    // to which the resources were unregistered.
    virtual void object_unregistered(M2MSecurity */*security_object*/){
        _registered = false;
        _unregistered = true;
        trace_printer("Unregistered Object Successfully");

        if (_onUnregistered) {
            _onUnregistered.call();
        }
    }

    /*
    * Callback from mbed client stack when registration is updated
    */
    virtual void registration_updated(M2MSecurity */*security_object*/, const M2MServer & /*server_object*/){
        /* The registration is updated automatically and frequently by the
        *  mbed client stack. This print statement is turned off because it
        *  tends to happen alot.
        */
        //trace_printer("\r\nRegistration Updated\r\n");
    }

    // Callback from mbed client stack if any error is encountered
    // during any of the LWM2M operations. Error type is passed in
    // the callback.
    virtual void error(M2MInterface::Error error){
        _error = true;
        switch(error){
            case M2MInterface::AlreadyExists:
                trace_printer("[ERROR:] M2MInterface::AlreadyExist");
                break;
            case M2MInterface::BootstrapFailed:
                trace_printer("[ERROR:] M2MInterface::BootstrapFailed");
                break;
            case M2MInterface::InvalidParameters:
                trace_printer("[ERROR:] M2MInterface::InvalidParameters");
                break;
            case M2MInterface::NotRegistered:
                trace_printer("[ERROR:] M2MInterface::NotRegistered");
                break;
            case M2MInterface::Timeout:
                trace_printer("[ERROR:] M2MInterface::Timeout");
                break;
            case M2MInterface::NetworkError:
                trace_printer("[ERROR:] M2MInterface::NetworkError");
                break;
            case M2MInterface::ResponseParseFailed:
                trace_printer("[ERROR:] M2MInterface::ResponseParseFailed");
                break;
            case M2MInterface::UnknownError:
                trace_printer("[ERROR:] M2MInterface::UnknownError");
                break;
            case M2MInterface::MemoryFail:
                trace_printer("[ERROR:] M2MInterface::MemoryFail");
                break;
            case M2MInterface::NotAllowed:
                trace_printer("[ERROR:] M2MInterface::NotAllowed");
                break;
            default:
                break;
        }
    }

    /* Callback from mbed client stack if any value has changed
    *  during PUT operation. Object and its type is passed in
    *  the callback.
    *  BaseType enum from m2mbase.h
    *       Object = 0x0, Resource = 0x1, ObjectInstance = 0x2, ResourceInstance = 0x3
    */
    virtual void value_updated(M2MBase *base, M2MBase::BaseType type) {
        if (_debug) printf("[SMC] PUT Request Received, type=%d\n", type);
        if (strcmp(base->uri_path(), "") != 0) {
            if (_debug) printf("[SMC] PUT came in for %s\n", base->uri_path());

            _onValueChanged.call(std::string(base->uri_path()));
        }
    }

    /*
    * update the registration period
    */
    void test_update_register() {
        if (_registered) {
            _interface->update_registration(_register_security, 100);
        }
    }

    /*
    * manually configure the security object private variable
    */
   void set_register_object(M2MSecurity *register_object) {
        if (_register_security == NULL) {
            _register_security = register_object;
        }
    }

private:

    /*
    *  Private variables used in class
    */
    M2MInterface                        *_interface;
    M2MSecurity                         *_register_security;
    M2MObject                           *_object;
    volatile bool                       _bootstrapped;
    volatile bool                       _error;
    volatile bool                       _registered;
    volatile bool                       _unregistered;
    int                                 _value;
    struct MbedClientOptions            _options;
    Callback<void()>                    _onRegistered;
    Callback<void()>                    _onUnregistered;
    Callback<void(std::string)>         _onValueChanged;
    bool                                _debug;
};

#endif // __SIMPLE_MBED_CLIENT_WRAPPER_H__
