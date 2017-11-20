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
#include "mbed-client/m2mobjectinstance.h"
#include "mbed-client/m2mobject.h"
#include "mbed-client/m2mconstants.h"
#include "mbed-client/m2mresource.h"
#include "mbed-client/m2mresource.h"
#include "mbed-client/m2mobservationhandler.h"
#include "mbed-client/m2mstring.h"
#include "mbed-client/m2mstringbuffer.h"
#include "include/m2mtlvserializer.h"
#include "include/m2mtlvdeserializer.h"
#include "include/nsdllinker.h"
#include "include/m2mreporthandler.h"
#include "mbed-trace/mbed_trace.h"

#include <stdlib.h>

#define BUFFER_SIZE 10
#define TRACE_GROUP "mClt"

M2MObjectInstance::M2MObjectInstance(M2MObject& parent, const String &object_name,
                                     const String &resource_type,
                                     char *path,
                                     bool external_blockwise_store)
: M2MBase(object_name,
          M2MBase::Dynamic,
          resource_type,
          path,
          external_blockwise_store),
  _parent(parent)
{
    M2MBase::set_base_type(M2MBase::ObjectInstance);
    M2MBase::set_coap_content_type(COAP_CONTENT_OMA_TLV_TYPE);
}

M2MObjectInstance::M2MObjectInstance(M2MObject& parent, const lwm2m_parameters_s* static_res)
: M2MBase(static_res), _parent(parent)
{
    M2MBase::set_coap_content_type(COAP_CONTENT_OMA_TLV_TYPE);
}

M2MObjectInstance::~M2MObjectInstance()
{
    if(!_resource_list.empty()) {
        M2MResource* res = NULL;
        M2MResourceList::const_iterator it;
        it = _resource_list.begin();
        for (; it!=_resource_list.end(); it++ ) {
            //Free allocated memory for resources.
            res = *it;
            delete res;
        }
        _resource_list.clear();
    }
}

// TBD, ResourceType to the base class struct?? TODO!
M2MResource* M2MObjectInstance::create_static_resource(const lwm2m_parameters_s* static_res,
                                                       M2MResourceInstance::ResourceType type)
{
    tr_debug("M2MObjectInstance::create_static_resource(lwm2m_parameters_s resource_name %s)", static_res->name);
    M2MResource *res = NULL;
    if (validate_string_length(static_res->name, 1, MAX_ALLOWED_STRING_LENGTH) == false) {
        return res;
    }
    if(!resource(static_res->name)) {
        res = new M2MResource(*this, static_res, type, (const uint16_t) M2MBase::instance_id());
        if(res) {
            res->add_observation_level(observation_level());
            //if (multiple_instance) {
                //res->set_coap_content_type(COAP_CONTENT_OMA_TLV_TYPE);
            //}
            _resource_list.push_back(res);
        }
    }
    return res;
}

M2MResource* M2MObjectInstance::create_static_resource(const String &resource_name,
                                                       const String &resource_type,
                                                       M2MResourceInstance::ResourceType type,
                                                       const uint8_t *value,
                                                       const uint8_t value_length,
                                                       bool multiple_instance,
                                                       bool external_blockwise_store)
{
    tr_debug("M2MObjectInstance::create_static_resource(resource_name %s)",resource_name.c_str());
    M2MResource *res = NULL;
    if (validate_string_length(resource_name, 1, MAX_ALLOWED_STRING_LENGTH) == false) {
        return res;
    }
    if(!resource(resource_name)) {
        char *path = create_path(*this, resource_name.c_str());

        if (path) {
            res = new M2MResource(*this, resource_name, resource_type, type,
                                  value, value_length, path, M2MBase::instance_id(),
                                  multiple_instance, external_blockwise_store);
            if(res) {
                res->add_observation_level(observation_level());
                if (multiple_instance) {
                    res->set_coap_content_type(COAP_CONTENT_OMA_TLV_TYPE);
                }
                _resource_list.push_back(res);
            }
        }
    }
    return res;
}

M2MResource* M2MObjectInstance::create_dynamic_resource(const lwm2m_parameters_s* static_res,
                                                        M2MResourceInstance::ResourceType type,
                                                        bool observable)
{
    tr_debug("M2MObjectInstance::create_dynamic_resource(resource_name %s)", static_res->name);
    M2MResource *res = NULL;

    if (validate_string_length(static_res->name, 1, MAX_ALLOWED_STRING_LENGTH) == false) {
        return res;
    }
    if(!resource(static_res->name)) {
        res = new M2MResource(*this, static_res, type, M2MBase::instance_id());
        if(res) {
            //if (multiple_instance) { // TODO!
              //  res->set_coap_content_type(COAP_CONTENT_OMA_TLV_TYPE);
            //}
            res->add_observation_level(observation_level());
            _resource_list.push_back(res);
        }
    }
    return res;
}

M2MResource* M2MObjectInstance::create_dynamic_resource(const String &resource_name,
                                                const String &resource_type,
                                                M2MResourceInstance::ResourceType type,
                                                bool observable,
                                                bool multiple_instance,
                                                bool external_blockwise_store)
{
    tr_debug("M2MObjectInstance::create_dynamic_resource(resource_name %s)",resource_name.c_str());
    M2MResource *res = NULL;
    if (validate_string_length(resource_name, 1, MAX_ALLOWED_STRING_LENGTH) == false) {
        return res;
    }
    if(!resource(resource_name)) {
        char *path = create_path(*this, resource_name.c_str());
        if (path) {
            res = new M2MResource(*this, resource_name, resource_type, type,
                                  observable, path, M2MBase::instance_id(),
                                  multiple_instance, external_blockwise_store);
            if(res) {
                if (multiple_instance) {
                    res->set_coap_content_type(COAP_CONTENT_OMA_TLV_TYPE);
                }
                res->add_observation_level(observation_level());
                _resource_list.push_back(res);
            }
        }
    }
    return res;
}

M2MResourceInstance* M2MObjectInstance::create_static_resource_instance(const String &resource_name,
                                                                        const String &resource_type,
                                                                        M2MResourceInstance::ResourceType type,
                                                                        const uint8_t *value,
                                                                        const uint8_t value_length,
                                                                        uint16_t instance_id,
                                                                        bool external_blockwise_store)
{
    tr_debug("M2MObjectInstance::create_static_resource_instance(resource_name %s)",resource_name.c_str());
    M2MResourceInstance *instance = NULL;
    if (validate_string_length(resource_name, 1, MAX_ALLOWED_STRING_LENGTH) == false) {

        return instance;
    }
    M2MResource *res = resource(resource_name);
    if(!res) {
        char *path = create_path(*this, resource_name.c_str());
        if (path) {
            res = new M2MResource(*this, resource_name, resource_type, type,
                                  value, value_length, path, M2MBase::instance_id(),
                                  true, external_blockwise_store);
            _resource_list.push_back(res);
            res->set_operation(M2MBase::GET_ALLOWED);
            res->set_observable(false);
            res->set_register_uri(false);
        }
    }
    if(res && res->supports_multiple_instances()&& (res->resource_instance(instance_id) == NULL)) {
        char *path = M2MBase::create_path(*res, instance_id);
        if (path) {
            instance = new M2MResourceInstance(*res, resource_name, resource_type, type,
                                               value, value_length,
                                               M2MBase::instance_id(),
                                               path, external_blockwise_store);
            if(instance) {
                instance->set_operation(M2MBase::GET_ALLOWED);
                instance->set_instance_id(instance_id);
                res->add_resource_instance(instance);
            }
        }
    }
    return instance;
}

M2MResourceInstance* M2MObjectInstance::create_dynamic_resource_instance(const String &resource_name,
                                                                         const String &resource_type,
                                                                         M2MResourceInstance::ResourceType type,
                                                                         bool observable,
                                                                         uint16_t instance_id,
                                                                         bool external_blockwise_store)
{
    tr_debug("M2MObjectInstance::create_dynamic_resource_instance(resource_name %s)",resource_name.c_str());
    M2MResourceInstance *instance = NULL;
    if (validate_string_length(resource_name, 1, MAX_ALLOWED_STRING_LENGTH) == false) {
        return instance;
    }
    M2MResource *res = resource(resource_name);
    if(!res) {
        char *path = create_path(*this, resource_name.c_str());
        if (path) {
            res = new M2MResource(*this, resource_name, resource_type, type,
                                  false, path, M2MBase::instance_id(), true);
            _resource_list.push_back(res);
            res->set_register_uri(false);
            res->set_operation(M2MBase::GET_ALLOWED);
        }
    }
    if (res && res->supports_multiple_instances() && (res->resource_instance(instance_id) == NULL)) {
        char *path = create_path(*res, instance_id);
        if (path) {
            instance = new M2MResourceInstance(*res, resource_name, resource_type, type,
                                               M2MBase::instance_id(),
                                               path, external_blockwise_store);
            if(instance) {
                instance->set_operation(M2MBase::GET_ALLOWED);
                instance->set_observable(observable);
                instance->set_instance_id(instance_id);
                res->add_resource_instance(instance);
            }
        }
    }
    return instance;
}

bool M2MObjectInstance::remove_resource(const String &resource_name)
{
    return remove_resource(resource_name.c_str());
}

bool M2MObjectInstance::remove_resource(const char *resource_name)
{
    tr_debug("M2MObjectInstance::remove_resource(resource_name %s)", resource_name);

    bool success = false;
    if(!_resource_list.empty()) {
         M2MResource* res = NULL;
         M2MResourceList::const_iterator it;
         it = _resource_list.begin();
         int pos = 0;
         for ( ; it != _resource_list.end(); it++, pos++ ) {
             if(strcmp((*it)->name(), resource_name) == 0) {
                // Resource found and deleted.
                res = *it;
                delete res;
                res = NULL;
                _resource_list.erase(pos);
                success = true;
                break;
             }
         }
     }
    return success;
}

bool M2MObjectInstance::remove_resource_instance(const String &resource_name,
                                                 uint16_t inst_id)
{
    tr_debug("M2MObjectInstance::remove_resource_instance(resource_name %s inst_id %d)",
             resource_name.c_str(), inst_id);
    bool success = false;
    M2MResource *res = resource(resource_name);
    if(res) {
        M2MResourceInstanceList list = res->resource_instances();
        M2MResourceInstanceList::const_iterator it;
        it = list.begin();
        for ( ; it != list.end(); it++) {
            if((*it)->instance_id() == inst_id) {
                success = res->remove_resource_instance(inst_id);
                if(res->resource_instance_count() == 0) {
                    M2MResourceList::const_iterator itr;
                    itr = _resource_list.begin();
                    int pos = 0;
                    for ( ; itr != _resource_list.end(); itr++, pos++ ) {
                        if(strcmp((*itr)->name(),resource_name.c_str()) == 0) {
                            delete res;
                            res = NULL;
                            _resource_list.erase(pos);
                            break;
                        }
                    }
                }
                break;
            }
        }
    }
    return success;
}

M2MResource* M2MObjectInstance::resource(const String &resource_name) const
{
    return resource(resource_name.c_str());
}

M2MResource* M2MObjectInstance::resource(const char *resource_name) const
{
    M2MResource *res = NULL;
    if(!_resource_list.empty()) {
        M2MResourceList::const_iterator it;
        it = _resource_list.begin();
        for (; it!=_resource_list.end(); it++ ) {
            if(strcmp((*it)->name(), resource_name) == 0) {
                res = *it;
                break;
            }
        }
    }
    return res;
}

const M2MResourceList& M2MObjectInstance::resources() const
{
    return _resource_list;
}

uint16_t M2MObjectInstance::resource_count() const
{
    uint16_t count = 0;
    if(!_resource_list.empty()) {
        M2MResourceList::const_iterator it;
        it = _resource_list.begin();
        for ( ; it != _resource_list.end(); it++ ) {
            if((*it)->supports_multiple_instances()) {
                count += (*it)->resource_instance_count();
            } else {
                count++;
            }
        }
    }
    return count;
}

uint16_t M2MObjectInstance::resource_count(const String& resource) const
{

    return resource_count(resource.c_str());
}

uint16_t M2MObjectInstance::resource_count(const char *resource) const
{
    uint16_t count = 0;
    if(!_resource_list.empty()) {
        M2MResourceList::const_iterator it;
        it = _resource_list.begin();
        for ( ; it != _resource_list.end(); it++ ) {
            if(strcmp((*it)->name(), resource) == 0) {
                if((*it)->supports_multiple_instances()) {
                    count += (*it)->resource_instance_count();
                } else {
                    count++;
                }
            }
        }
    }
    return count;
}

M2MBase::BaseType M2MObjectInstance::base_type() const
{
    return M2MBase::base_type();
}

void M2MObjectInstance::add_observation_level(M2MBase::Observation observation_level)
{
    M2MBase::add_observation_level(observation_level);
    if(!_resource_list.empty()) {
        M2MResourceList::const_iterator it;
        it = _resource_list.begin();
        for ( ; it != _resource_list.end(); it++ ) {
            (*it)->add_observation_level(observation_level);
        }
    }
}

void M2MObjectInstance::remove_observation_level(M2MBase::Observation observation_level)
{
    M2MBase::remove_observation_level(observation_level);
    if(!_resource_list.empty()) {
        M2MResourceList::const_iterator it;
        it = _resource_list.begin();
        for ( ; it != _resource_list.end(); it++ ) {
           (*it)->remove_observation_level(observation_level);
        }
    }
}

sn_coap_hdr_s* M2MObjectInstance::handle_get_request(nsdl_s *nsdl,
                                                     sn_coap_hdr_s *received_coap_header,
                                                     M2MObservationHandler *observation_handler)
{
    tr_debug("M2MObjectInstance::handle_get_request()");
    sn_coap_msg_code_e msg_code = COAP_MSG_CODE_RESPONSE_CONTENT;
    sn_coap_hdr_s * coap_response = sn_nsdl_build_response(nsdl,
                                                           received_coap_header,
                                                           msg_code);
    uint8_t * data = NULL;
    uint32_t  data_length = 0;
    if(received_coap_header) {
        // process the GET if we have registered a callback for it
        if ((operation() & SN_GRS_GET_ALLOWED) != 0) {
            if(coap_response) {
                uint16_t coap_content_type = 0;
                bool content_type_present = false;

                if(received_coap_header->content_format != COAP_CT_NONE) {
                    content_type_present = true;
                    coap_content_type = received_coap_header->content_format;
                }
                if(!content_type_present &&
                   M2MBase::coap_content_type() == COAP_CONTENT_OMA_TLV_TYPE) {
                    coap_content_type = COAP_CONTENT_OMA_TLV_TYPE;
                }

                tr_debug("M2MObjectInstance::handle_get_request() - Request Content-Type %d", coap_content_type);
                if (coap_response->content_format == COAP_CT_NONE) {
                    coap_response->content_format = sn_coap_content_format_e(coap_content_type);

                    if (coap_response->content_format != COAP_CT_NONE) {
                        set_coap_content_type(coap_content_type);
                    }
                }
                // fill in the CoAP response payload
                if(COAP_CONTENT_OMA_TLV_TYPE == coap_content_type) {
                    M2MTLVSerializer serializer;
                    data = serializer.serialize(_resource_list, data_length);
                } else {
                    msg_code = COAP_MSG_CODE_RESPONSE_UNSUPPORTED_CONTENT_FORMAT; // Content format not supported
                }

                coap_response->payload_len = data_length;
                coap_response->payload_ptr = data;

                if(data) {
                    coap_response->options_list_ptr = sn_nsdl_alloc_options_list(nsdl, coap_response);

                    coap_response->options_list_ptr->max_age = max_age();

                    if(received_coap_header->options_list_ptr) {
                        if(received_coap_header->options_list_ptr->observe != -1) {
                            if (is_observable()) {
                                uint32_t number = 0;
                                uint8_t observe_option = 0;
                                observe_option = received_coap_header->options_list_ptr->observe;
                                if(START_OBSERVATION == observe_option) {
                                    tr_debug("M2MObjectInstance::handle_get_request - Starts Observation");
                                    // If the observe length is 0 means register for observation.
                                    if(received_coap_header->options_list_ptr->observe != -1) {
                                        number = received_coap_header->options_list_ptr->observe;
                                    }
                                    if(received_coap_header->token_ptr) {
                                        tr_debug("M2MObjectInstance::handle_get_request - Sets Observation Token to resource");
                                        set_observation_token(received_coap_header->token_ptr,
                                                              received_coap_header->token_len);
                                    }

                                    // If the observe value is 0 means register for observation.
                                    if(number == 0) {
                                        tr_debug("M2MObjectInstance::handle_get_request - Put Resource under Observation");
                                        set_under_observation(true,observation_handler);
                                        add_observation_level(M2MBase::OI_Attribute);
                                        coap_response->options_list_ptr->observe = observation_number();
                                    }
                                } else if (STOP_OBSERVATION == observe_option) {
                                    tr_debug("M2MObjectInstance::handle_get_request - Stops Observation");
                                    set_under_observation(false,NULL);
                                    remove_observation_level(M2MBase::OI_Attribute);

                                }
                                msg_code = COAP_MSG_CODE_RESPONSE_CONTENT;
                            }
                            else {
                                msg_code = COAP_MSG_CODE_RESPONSE_METHOD_NOT_ALLOWED;
                            }
                        }
                    }
                } else {
                    msg_code = COAP_MSG_CODE_RESPONSE_UNSUPPORTED_CONTENT_FORMAT; // Content format not supported
                }
            }
        }else {
            tr_error("M2MObjectInstance::handle_get_request - Return COAP_MSG_CODE_RESPONSE_METHOD_NOT_ALLOWED");
            // Operation is not allowed.
            msg_code = COAP_MSG_CODE_RESPONSE_METHOD_NOT_ALLOWED;
        }
    } else {
        msg_code = COAP_MSG_CODE_RESPONSE_METHOD_NOT_ALLOWED;
    }
    if(coap_response) {
        coap_response->msg_code = msg_code;
    }
    return coap_response;
}

sn_coap_hdr_s* M2MObjectInstance::handle_put_request(nsdl_s *nsdl,
                                                     sn_coap_hdr_s *received_coap_header,
                                                     M2MObservationHandler *observation_handler,
                                                     bool &/*execute_value_updated*/)
{
    tr_debug("M2MObjectInstance::handle_put_request()");
    sn_coap_msg_code_e msg_code = COAP_MSG_CODE_RESPONSE_CHANGED; // 2.04
    sn_coap_hdr_s * coap_response = sn_nsdl_build_response(nsdl,
                                                           received_coap_header,
                                                           msg_code);;
    if(received_coap_header) {
        uint16_t coap_content_type = 0;
        bool content_type_present = false;
        if(received_coap_header->content_format != COAP_CT_NONE) {
            content_type_present = true;
            if(coap_response) {
                coap_content_type = received_coap_header->content_format;
            }
        }
        if(received_coap_header->options_list_ptr &&
           received_coap_header->options_list_ptr->uri_query_ptr) {
            char *query = (char*)alloc_string_copy(received_coap_header->options_list_ptr->uri_query_ptr,
                                                    received_coap_header->options_list_ptr->uri_query_len);
            if (query){
                tr_debug("M2MObjectInstance::handle_put_request() - Query %s", query);
                // if anything was updated, re-initialize the stored notification attributes
                if (!handle_observation_attribute(query)){
                    tr_debug("M2MObjectInstance::handle_put_request() - Invalid query");
                    msg_code = COAP_MSG_CODE_RESPONSE_BAD_REQUEST; // 4.00
                } else {
                    msg_code =COAP_MSG_CODE_RESPONSE_CHANGED;
                }
                free(query);
            }
        } else if ((operation() & SN_GRS_PUT_ALLOWED) != 0) {
            if(!content_type_present &&
               M2MBase::coap_content_type() == COAP_CONTENT_OMA_TLV_TYPE) {
                coap_content_type = COAP_CONTENT_OMA_TLV_TYPE;
            }

            tr_debug("M2MObjectInstance::handle_put_request() - Request Content-Type %d", coap_content_type);

            if(COAP_CONTENT_OMA_TLV_TYPE == coap_content_type) {
                M2MTLVDeserializer::Error error = M2MTLVDeserializer::None;
                M2MTLVDeserializer deserializer;
                if(received_coap_header->payload_ptr) {
                    error = deserializer.deserialize_resources(received_coap_header->payload_ptr,
                                                                received_coap_header->payload_len,
                                                                *this,
                                                                M2MTLVDeserializer::Put);
                    switch(error) {
                        case M2MTLVDeserializer::None:
                            if(observation_handler) {
                                observation_handler->value_updated(this);
                            }
                            msg_code = COAP_MSG_CODE_RESPONSE_CHANGED;
                            break;
                        case M2MTLVDeserializer::NotFound:
                            msg_code = COAP_MSG_CODE_RESPONSE_NOT_FOUND;
                            break;
                        case M2MTLVDeserializer::NotAllowed:
                            msg_code = COAP_MSG_CODE_RESPONSE_METHOD_NOT_ALLOWED;
                            break;
                        case M2MTLVDeserializer::NotValid:
                            msg_code = COAP_MSG_CODE_RESPONSE_BAD_REQUEST;
                            break;
                    }
                }
            } else {
                msg_code =COAP_MSG_CODE_RESPONSE_UNSUPPORTED_CONTENT_FORMAT;
            } // if(COAP_CONTENT_OMA_TLV_TYPE == coap_content_type)
        } else {
            // Operation is not allowed.
            tr_error("M2MObjectInstance::handle_put_request() - COAP_MSG_CODE_RESPONSE_METHOD_NOT_ALLOWED");
            msg_code = COAP_MSG_CODE_RESPONSE_METHOD_NOT_ALLOWED;
        }
    } else {
       msg_code = COAP_MSG_CODE_RESPONSE_METHOD_NOT_ALLOWED;
    }
    if(coap_response) {
        coap_response->msg_code = msg_code;
    }
    return coap_response;
}




sn_coap_hdr_s* M2MObjectInstance::handle_post_request(nsdl_s *nsdl,
                                                      sn_coap_hdr_s *received_coap_header,
                                                      M2MObservationHandler *observation_handler,
                                                      bool &execute_value_updated,
                                                      sn_nsdl_addr_s *)
{
    tr_debug("M2MObjectInstance::handle_post_request()");
    sn_coap_msg_code_e msg_code = COAP_MSG_CODE_RESPONSE_CHANGED; // 2.04
    sn_coap_hdr_s * coap_response = sn_nsdl_build_response(nsdl,
                                                           received_coap_header,
                                                           msg_code);
    if(received_coap_header) {
        if ((operation() & SN_GRS_POST_ALLOWED) != 0) {
            uint16_t coap_content_type = 0;
            bool content_type_present = false;
            if(received_coap_header->content_format != COAP_CT_NONE) {
                content_type_present = true;
                if(coap_response) {
                    coap_content_type = received_coap_header->content_format;
                }
            }
            if(!content_type_present &&
               M2MBase::coap_content_type() == COAP_CONTENT_OMA_TLV_TYPE) {
                coap_content_type = COAP_CONTENT_OMA_TLV_TYPE;
            }

            tr_debug("M2MObjectInstance::handle_post_request() - Request Content-Type %d", coap_content_type);

            if(COAP_CONTENT_OMA_TLV_TYPE == coap_content_type) {
                M2MTLVDeserializer deserializer;
                M2MTLVDeserializer::Error error = M2MTLVDeserializer::None;
                error = deserializer.deserialize_resources(received_coap_header->payload_ptr,
                                                            received_coap_header->payload_len,
                                                            *this,
                                                            M2MTLVDeserializer::Post);

                uint16_t instance_id = deserializer.instance_id(received_coap_header->payload_ptr);
                switch(error) {
                    case M2MTLVDeserializer::None:
                        if(observation_handler) {
                            execute_value_updated = true;
                        }
                        coap_response->options_list_ptr = sn_nsdl_alloc_options_list(nsdl, coap_response);

                        if (coap_response->options_list_ptr) {

                              StringBuffer<MAX_PATH_SIZE_3> obj_name;
                              if(!build_path(obj_name, M2MBase::name(), M2MBase::instance_id(), instance_id))
                              {
                                  msg_code = COAP_MSG_CODE_RESPONSE_INTERNAL_SERVER_ERROR;
                                  break;
                              }

                              coap_response->options_list_ptr->location_path_len = obj_name.get_size();
                              coap_response->options_list_ptr->location_path_ptr =
                                  alloc_string_copy((uint8_t*)obj_name.c_str(),
                                                    coap_response->options_list_ptr->location_path_len);
                              // todo: handle allocation error
                        }
                        msg_code = COAP_MSG_CODE_RESPONSE_CREATED;
                        break;
                    case M2MTLVDeserializer::NotAllowed:
                        msg_code = COAP_MSG_CODE_RESPONSE_METHOD_NOT_ALLOWED;
                        break;
                    case M2MTLVDeserializer::NotValid:
                        msg_code = COAP_MSG_CODE_RESPONSE_BAD_REQUEST;
                        break;
                    default:
                        break;
                }
            } else {
                msg_code =COAP_MSG_CODE_RESPONSE_UNSUPPORTED_CONTENT_FORMAT;
            } // if(COAP_CONTENT_OMA_TLV_TYPE == coap_content_type)
        } else {
            // Operation is not allowed.
            tr_error("M2MObjectInstance::handle_post_request() - COAP_MSG_CODE_RESPONSE_METHOD_NOT_ALLOWED");
            msg_code = COAP_MSG_CODE_RESPONSE_METHOD_NOT_ALLOWED;
        }
    } else {
        msg_code = COAP_MSG_CODE_RESPONSE_METHOD_NOT_ALLOWED;
    }
    if(coap_response) {
        coap_response->msg_code = msg_code;
    }
    return coap_response;
}

void M2MObjectInstance::notification_update(M2MBase::Observation observation_level)
{
    tr_debug("M2MObjectInstance::notification_update() - level(%d)", observation_level);
    if((M2MBase::O_Attribute & observation_level) == M2MBase::O_Attribute) {
        tr_debug("M2MObjectInstance::notification_update() - object callback");
        _parent.notification_update(instance_id());
    }
    if((M2MBase::OI_Attribute & observation_level) == M2MBase::OI_Attribute) {
        tr_debug("M2MObjectInstance::notification_update() - object instance callback");
        M2MReportHandler *report_handler = M2MBase::report_handler();
        if(report_handler && is_under_observation()) {
            report_handler->set_notification_trigger();
        }

    }
}
