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
#ifndef M2M_RESOURCE_INSTANCE_H
#define M2M_RESOURCE_INSTANCE_H

#include "mbed-client/m2mbase.h"
#include "mbed-client/functionpointer.h"


/*! \file m2mresourceinstance.h
 *  \brief M2MResourceInstance.
 *  This class is the base class for mbed Client Resources. All defined
 *  LWM2M resource models can be created based on it.
 */
class M2MBlockMessage;

typedef FP1<void,void*> execute_callback;
typedef void(*execute_callback_2) (void *arguments);

typedef FP0<void> notification_sent_callback;
typedef void(*notification_sent_callback_2) (void);

typedef FP1<void, M2MBlockMessage *> incoming_block_message_callback;
typedef FP3<void, const String &, uint8_t *&, uint32_t &> outgoing_block_message_callback;

class M2MResource;
class M2MResourceCallback;

class M2MResourceInstance : public M2MBase {

friend class M2MObjectInstance;
friend class M2MResource;

public:

    /**
     * An enum defining a resource type that can be
     * supported by a given resource.
    */
    typedef enum {
        STRING,
        INTEGER,
        FLOAT,
        BOOLEAN,
        OPAQUE,
        TIME,
        OBJLINK
    }ResourceType;


private: // Constructor and destructor are private
         // which means that these objects can be created or
         // deleted only through a function provided by the M2MObjectInstance.

    M2MResourceInstance(M2MResource &parent,
                        const lwm2m_parameters_s* s,
                        M2MResourceInstance::ResourceType type,
                        const uint16_t object_instance_id);
    /**
     * \brief A constructor for creating a resource.
     * \param resource_name The name of the resource.
     * \param resource_type The type of the resource.
     * \param type The resource data type of the object.
     * \param object_instance_id Object instance id where resource exists.
     * \param object_name Object name where resource exists.
     * \param path Path of the object like 3/0/1
     * \param external_blockwise_store If true CoAP blocks are passed to application through callbacks
     *        otherwise handled in mbed-client-c.
     */
    M2MResourceInstance(M2MResource &parent,
                        const String &resource_name,
                        const String &resource_type,
                        M2MResourceInstance::ResourceType type,
                        const uint16_t object_instance_id,
                        char* path,
                        bool external_blockwise_store);

    /**
     * \brief A Constructor for creating a resource.
     * \param resource_name The name of the resource.
     * \param resource_type The type of the resource.
     * \param type The resource data type of the object.
     * \param value The value pointer of the object.
     * \param value_length The length of the value pointer.
     * \param value_length The length of the value pointer.
     * \param object_instance_id Object instance id where resource exists.
     * \param object_name Object name where resource exists.
     * \param path Path of the object like 3/0/1
     * \param external_blockwise_store If true CoAP blocks are passed to application through callbacks
     *        otherwise handled in mbed-client-c.
     */
    M2MResourceInstance(M2MResource &parent,
                        const String &resource_name,
                        const String &resource_type,
                        M2MResourceInstance::ResourceType type,
                        const uint8_t *value,
                        const uint8_t value_length,
                        const uint16_t object_instance_id,
                        char* path,
                        bool external_blockwise_store);

    // Prevents the use of default constructor.
    M2MResourceInstance();

    // Prevents the use of assignment operator.
    M2MResourceInstance& operator=( const M2MResourceInstance& /*other*/ );

    // Prevents the use of copy constructor
    M2MResourceInstance( const M2MResourceInstance& /*other*/ );

    /**
     * Destructor
     */
    virtual ~M2MResourceInstance();

public:

    /**
     * \brief Returns the object type.
     * \return BaseType.
     */
    virtual M2MBase::BaseType base_type() const;

    /**
     * \brief Returns the resource data type.
     * \return ResourceType.
     */
    virtual M2MResourceInstance::ResourceType resource_instance_type() const;

    /**
     * \brief Parses the received query for a notification
     * attribute.
     * \return True if required attributes are present, else false.
     */
    virtual bool handle_observation_attribute(const char *query);

    /**
     * \brief Sets the function that should be executed when this
     * resource receives a POST command.
     * \param callback The function pointer that needs to be executed.
     */
    virtual void set_execute_function(execute_callback callback);

    /**
     * \brief Sets the function that should be executed when this
     * resource receives a POST command.
     * \param callback The function pointer that needs to be executed.
     */
    virtual void set_execute_function(execute_callback_2 callback);

    /**
     * \brief Sets a value of a given resource.
     * \param value A pointer to the value to be set on the resource.
     * \param value_length The length of the value pointer.
     * \return True if successfully set, else false.
     */
    virtual bool set_value(const uint8_t *value, const uint32_t value_length);

    /**
     * \brief Sets a value of a given resource.
     * \param value, A new value formatted as a string
     * and set on the resource.
     * \return True if successfully set, else false.
     */
    virtual bool set_value(int64_t value);

    /**
     * \brief Clears the value of a given resource.
     */
    virtual void clear_value();

    /**
     * \brief Executes the function that is set in "set_execute_function".
     * \param arguments The arguments that are passed to be executed.
     */
    void execute(void *arguments);

    /**
     * \brief Provides the value of the given resource.
     * \param value[OUT] A pointer to the resource value.
     * \param value_length[OUT] The length of the value pointer.
     */
    virtual void get_value(uint8_t *&value, uint32_t &value_length);

    /**
     * \brief Converts a value to integer and returns it. Note: Conversion
     * errors are not detected.
     */
    int get_value_int();

    /**
     * Get the value as a string object. No encoding/charset conversions
     * are done for the value, just a raw copy.
     */
    String get_value_string() const;

    /**
     * \brief Returns the value pointer of the object.
     * \return The value pointer of the object.
    */
    uint8_t* value() const;

    /**
     * \brief Returns the length of the value pointer.
     * \return The length of the value pointer.
    */
    uint32_t value_length() const;

    /**
     * \brief Handles the GET request for the registered objects.
     * \param nsdl An NSDL handler for the CoAP library.
     * \param received_coap_header The CoAP message received from the server.
     * \param observation_handler A handler object for sending
     * observation callbacks.
     * \return sn_coap_hdr_s The message that needs to be sent to the server.
     */
    virtual sn_coap_hdr_s* handle_get_request(nsdl_s *nsdl,
                                              sn_coap_hdr_s *received_coap_header,
                                              M2MObservationHandler *observation_handler = NULL);
    /**
     * \brief Handles the PUT request for the registered objects.
     * \param nsdl An NSDL handler for the CoAP library.
     * \param received_coap_header The CoAP message received from the server.
     * \param observation_handler A handler object for sending
     * observation callbacks.
     * \param execute_value_updated True will execute the "value_updated" callback.
     * \return sn_coap_hdr_s The message that needs to be sent to the server.
     */
    virtual sn_coap_hdr_s* handle_put_request(nsdl_s *nsdl,
                                              sn_coap_hdr_s *received_coap_header,
                                              M2MObservationHandler *observation_handler,
                                              bool &execute_value_updated);

    /**
     * \brief Returns the instance ID of the object where the resource exists.
     * \return Object instance ID.
    */
    uint16_t object_instance_id() const;

    /**
     * \brief Returns the name of the object where the resource exists.
     * \return Object name.
    */
    virtual const char* object_name() const;

    /**
     * @brief Sets the function that is executed when this
     * object receives a block-wise message.
     * @param callback The function pointer that is called.
     */
    virtual void set_incoming_block_message_callback(incoming_block_message_callback callback);

    /**
     * @brief Sets the function that is executed when this
     * object receives a GET request.
     * This is called if resource values are stored on the application side.
     * NOTE! Due to a limitation in the mbed-client-c library, a GET request can only contain data size up to 65KB.
     * @param callback The function pointer that is called.
     */
    virtual void set_outgoing_block_message_callback(outgoing_block_message_callback callback);

    /**
     * \brief Returns the block message object.
     * \return Block message.
    */
    virtual M2MBlockMessage* block_message() const;

    /**
     * @brief Sets the function that is executed when this object receives
     * response(Empty ACK) for notification message.
     * @param callback The function pointer that is called.
     */
    void set_notification_sent_callback(notification_sent_callback callback);

    /**
     * @brief Sets the function that is executed when this object receives
     * response(Empty ACK) for notification message.
     * @param callback The function pointer that is called.
     */
    void set_notification_sent_callback(notification_sent_callback_2 callback);

    /**
     * \brief Executes the function that is set in "set_notification_sent_callback".
     */
    void notification_sent();

    M2MResource& get_parent_resource() const;

protected:

    /**
     * \brief Set an observer for sending the notification update.
     * \param resource The callback handle.
     */
    void set_resource_observer(M2MResourceCallback *resource);

private:

    void report();

    bool is_value_changed(const uint8_t* value, const uint32_t value_len);

private:

    // XXX: since the M2MResource is inherited from this class, the resource actually has back
    // pointer to itself. If this inheritance was broken, we could save some memory.
    M2MResource &_parent_resource;

    uint8_t                                 *_value;
    uint32_t                                _value_length;
    M2MBlockMessage                         *_block_message_data;
    execute_callback                        *_execute_callback;
    M2MResourceCallback                     *_resource_callback; // Not owned
    FP1<void, void*>                        *_execute_function_pointer;
    FP0<void>                               *_notification_sent_function_pointer;

    // Note: these two callbacks should be moved behind ifdef, as they are not needed by all/most apps.
    incoming_block_message_callback         *_incoming_block_message_cb;
    outgoing_block_message_callback         *_outgoing_block_message_cb;

    notification_sent_callback              *_notification_sent_callback;
    uint16_t                                _object_instance_id;
    ResourceType                            _resource_type;

    friend class Test_M2MResourceInstance;
    friend class Test_M2MResource;
    friend class Test_M2MObjectInstance;
    friend class Test_M2MObject;
    friend class Test_M2MDevice;
    friend class Test_M2MSecurity;
    friend class Test_M2MServer;
    friend class Test_M2MNsdlInterface;
    friend class Test_M2MFirmware;
    friend class Test_M2MTLVSerializer;
    friend class Test_M2MTLVDeserializer;
};

#endif // M2M_RESOURCE_INSTANCE_H
