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
#include <stdlib.h>
#include "mbed-client/m2mresource.h"
#include "mbed-client/m2mconstants.h"
#include "mbed-client/m2mobservationhandler.h"
#include "mbed-client/m2mobject.h"
#include "mbed-client/m2mobjectinstance.h"
#include "include/m2mreporthandler.h"
#include "include/nsdllinker.h"
#include "mbed-client/m2mblockmessage.h"
#include "mbed-trace/mbed_trace.h"

#define TRACE_GROUP "mClt"

M2MResourceInstance::M2MResourceInstance(M2MResource &parent,
                                         const String &res_name,
                                         const String &resource_type,
                                         M2MResourceInstance::ResourceType type,
                                         const uint16_t object_instance_id,
                                         char* path,
                                         bool external_blockwise_store)
: M2MBase(res_name,
          M2MBase::Dynamic,
          resource_type,
          path,
          external_blockwise_store),
 _parent_resource(parent),
 _value(NULL),
 _value_length(0),
 _block_message_data(NULL),
 _execute_callback(NULL),
 _resource_callback(NULL),
 _execute_function_pointer(NULL),
 _notification_sent_function_pointer(NULL),
 _incoming_block_message_cb(NULL),
 _outgoing_block_message_cb(NULL),
 _notification_sent_callback(NULL),
 _object_instance_id(object_instance_id),
 _resource_type(type)
{
    M2MBase::set_base_type(M2MBase::ResourceInstance);
}

M2MResourceInstance::M2MResourceInstance(M2MResource &parent,
                                         const String &res_name,
                                         const String &resource_type,
                                         M2MResourceInstance::ResourceType type,
                                         const uint8_t *value,
                                         const uint8_t value_length,
                                         const uint16_t object_instance_id,
                                         char* path,
                                         bool external_blockwise_store)
: M2MBase(res_name,
          M2MBase::Static,
          resource_type,
          path,
          external_blockwise_store),
 _parent_resource(parent),
 _value(NULL),
 _value_length(0),
 _block_message_data(NULL),
 _execute_callback(NULL),
 _resource_callback(NULL),
 _execute_function_pointer(NULL),
 _notification_sent_function_pointer(NULL),
 _incoming_block_message_cb(NULL),
 _outgoing_block_message_cb(NULL),
 _notification_sent_callback(NULL),
 _object_instance_id(object_instance_id),
  _resource_type(type)
{
    M2MBase::set_base_type(M2MBase::Resource);
    if (mode() == M2MBase::Dynamic) {
        if( value != NULL && value_length > 0 ) {
            _value = alloc_string_copy(value, value_length);
            if(_value) {
                _value_length = value_length;
            }
        }
    }
    // Copy resource value to struct since static resources are handled in mbed-client-c
    else if (mode() == M2MBase::Static) {
       sn_nsdl_dynamic_resource_parameters_s* res = get_nsdl_resource();
       sn_nsdl_static_resource_parameters_s* params = (sn_nsdl_static_resource_parameters_s*)res->static_resource_parameters;
       params->resource = alloc_string_copy(value, value_length);
       params->resourcelen = value_length;
    }
    else {
        // Directory, not supported
    }
}

M2MResourceInstance::M2MResourceInstance(M2MResource &parent,
                                         const lwm2m_parameters_s* s,
                                         M2MResourceInstance::ResourceType type,
                                         const uint16_t object_instance_id)
: M2MBase(s),
  _parent_resource(parent),
  _value(NULL),
  _value_length(0),
  _block_message_data(NULL),
  _execute_callback(NULL),
  _resource_callback(NULL),
  _execute_function_pointer(NULL),
  _notification_sent_function_pointer(NULL),
  _incoming_block_message_cb(NULL),
  _outgoing_block_message_cb(NULL),
  _notification_sent_callback(NULL),
  _object_instance_id(object_instance_id),
  _resource_type(type)
{
    //TBD: put to flash, or parse from the uri_path!!!!
    //same for the _object_instance_id.
    // TBD: we dont need _value here, because in c-struct there is resource field!!!!
    if( s->dynamic_resource_params->static_resource_parameters->resource != NULL &&
            s->dynamic_resource_params->static_resource_parameters->resourcelen > 0 ) {
        _value = alloc_string_copy(s->dynamic_resource_params->static_resource_parameters->resource,
                                   s->dynamic_resource_params->static_resource_parameters->resourcelen);
        if(_value) {
            _value_length = s->dynamic_resource_params->static_resource_parameters->resourcelen;
        }
    }
    //M2MBase::set_base_type(M2MBase::ResourceInstance);
}

M2MResourceInstance::~M2MResourceInstance()
{
    free(_value);
    delete _execute_function_pointer;
    delete _execute_callback;
    delete _notification_sent_function_pointer;
    delete _incoming_block_message_cb;
    delete _outgoing_block_message_cb;
    delete _notification_sent_callback;
    delete _block_message_data;
}

M2MBase::BaseType M2MResourceInstance::base_type() const
{
    return M2MBase::base_type();
}

M2MResourceInstance::ResourceType M2MResourceInstance::resource_instance_type() const
{
    return _resource_type;
}

bool M2MResourceInstance::handle_observation_attribute(const char *query)
{
    tr_debug("M2MResourceInstance::handle_observation_attribute - is_under_observation(%d)", is_under_observation());
    bool success = false;

    M2MReportHandler *handler = M2MBase::report_handler();
    if (!handler) {
        handler = M2MBase::create_report_handler();
    }

    if (handler) {
        success = handler->parse_notification_attribute(query,
                M2MBase::base_type(), _resource_type);
        if(success) {
            if (is_under_observation()) {
                handler->set_under_observation(true);
            }
        } else {
            handler->set_default_values();
        }
    }
    return success;
}

void M2MResourceInstance::set_execute_function(execute_callback callback)
{
    delete _execute_callback;
    _execute_callback = new execute_callback(callback);
}

void M2MResourceInstance::set_execute_function(execute_callback_2 callback)
{
    delete _execute_function_pointer;

    _execute_function_pointer = new FP1<void, void*>(callback);
    set_execute_function(execute_callback(_execute_function_pointer, &FP1<void, void*>::call));
}

void M2MResourceInstance::clear_value()
{
    tr_debug("M2MResourceInstance::clear_value");

     free(_value);
     _value = NULL;
     _value_length = 0;

    report();
}

bool M2MResourceInstance::set_value(int64_t value)
{
    bool success;
    // max len of "-9223372036854775808" plus zero termination
    char buffer[20+1];
    uint32_t size = m2m::itoa_c(value, buffer);

    success = set_value((const uint8_t*)buffer, size);

    return success;
}

bool M2MResourceInstance::set_value(const uint8_t *value,
                                    const uint32_t value_length)
{
    tr_debug("M2MResourceInstance::set_value()");
    bool success = false;
    bool value_changed = false;
    if(is_value_changed(value,value_length)) {
        value_changed = true;
    }
    if( value != NULL && value_length > 0 ) {
        success = true;

        free(_value);
        _value_length = 0;

        _value = alloc_string_copy(value, value_length);
        if(_value) {
            _value_length = value_length;
            if( value_changed ) { //
                if (_resource_type == M2MResourceInstance::STRING) {
                    M2MReportHandler *report_handler = M2MBase::report_handler();
                    if(report_handler && is_under_observation()) {
                        report_handler->set_notification_trigger();
                    }
                }
                else {
                    report();
                }
            }
        }
    }
    return success;
}

void M2MResourceInstance::report()
{
    tr_debug("M2MResourceInstance::report()");
    M2MBase::Observation  observation_level = M2MBase::observation_level();
    tr_debug("M2MResourceInstance::report() - level %d", observation_level);
    if((M2MBase::O_Attribute & observation_level) == M2MBase::O_Attribute ||
       (M2MBase::OI_Attribute & observation_level) == M2MBase::OI_Attribute) {
        tr_debug("M2MResourceInstance::report() -- object/instance level");
        M2MObjectInstance& object_instance = get_parent_resource().get_parent_object_instance();
        object_instance.notification_update(observation_level);
    }

    if(M2MBase::Dynamic == mode() &&
       (M2MBase::R_Attribute & observation_level) == M2MBase::R_Attribute) {
        tr_debug("M2MResourceInstance::report() - resource level");
        if(!_resource_callback && _resource_type != M2MResourceInstance::STRING) {
            M2MReportHandler *report_handler = M2MBase::report_handler();
            if (report_handler && is_observable()) {
                if(_value) {
                    report_handler->set_value(atof((const char*)_value));
                } else {
                    report_handler->set_value(0);
                }
            }
        }
        else {
            if (_resource_callback && base_type() == M2MBase::ResourceInstance) {
                _resource_callback->notification_update();
            }
        }
    } else if(M2MBase::Static == mode()) {
        M2MObservationHandler *observation_handler = M2MBase::observation_handler();
        if(observation_handler) {
            observation_handler->value_updated(this);
        }
    } else {
        tr_debug("M2MResourceInstance::report() - mode = %d, is_observable = %d", mode(), is_observable());
    }
}

bool M2MResourceInstance::is_value_changed(const uint8_t* value, const uint32_t value_len)
{
    bool changed = false;
    if(value_len != _value_length) {
        changed = true;
    } else if(value && !_value) {
        changed = true;
    } else if(_value && !value) {
        changed = true;
    } else {
        if (_value) {
            if (strcmp((char*)value, (char*)_value) != 0) {
                changed = true;
            }
        }
    }
    tr_debug("M2MResourceInstance::is_value_changed() -- %s", changed ? "true" : "false");
    return changed;
}

void M2MResourceInstance::execute(void *arguments)
{
    tr_debug("M2MResourceInstance::execute");
    if(_execute_callback) {
        (*_execute_callback)(arguments);
    }
}

void M2MResourceInstance::get_value(uint8_t *&value, uint32_t &value_length)
{
    value_length = 0;
    if(value) {
        free(value);
        value = NULL;
    }
    if(_value && _value_length > 0) {
        value = alloc_string_copy(_value, _value_length);
        if(value) {
            value_length = _value_length;
        }
    }
}

int M2MResourceInstance::get_value_int()
{
    int value_int = 0;
    // Get the value and convert it into integer. This is not the most
    // efficient way, as it takes pointless heap copy to get the zero termination.
    uint8_t* buffer = NULL;
    uint32_t length;
    get_value(buffer,length);
    if(buffer) {
        value_int = atoi((const char*)buffer);
        free(buffer);
    }
    return value_int;
}

String M2MResourceInstance::get_value_string() const
{
    // XXX: do a better constructor to avoid pointless malloc
    String value;
    if (_value) {
        value.append_raw((char*)_value, _value_length);
    }

    return value;
}

uint8_t* M2MResourceInstance::value() const
{
    return _value;
}

uint32_t M2MResourceInstance::value_length() const
{
    return _value_length;
}

sn_coap_hdr_s* M2MResourceInstance::handle_get_request(nsdl_s *nsdl,
                                               sn_coap_hdr_s *received_coap_header,
                                               M2MObservationHandler *observation_handler)
{
    tr_debug("M2MResourceInstance::handle_get_request()");
    sn_coap_msg_code_e msg_code = COAP_MSG_CODE_RESPONSE_CONTENT;
    sn_coap_hdr_s *coap_response = sn_nsdl_build_response(nsdl,
                                                          received_coap_header,
                                                          msg_code);
    if(received_coap_header) {
        // process the GET if we have registered a callback for it
        if ((operation() & SN_GRS_GET_ALLOWED) != 0) {
            if(coap_response) {
                if(_resource_type == M2MResourceInstance::OPAQUE) {
                    coap_response->content_format = sn_coap_content_format_e(COAP_CONTENT_OMA_OPAQUE_TYPE);
                } else {
                    coap_response->content_format = sn_coap_content_format_e(0);
                }
                // fill in the CoAP response payload
                coap_response->payload_ptr = NULL;
                uint32_t payload_len = 0;

                //If handler exists it means that resource value is stored in application side
                if (block_message() && block_message()->is_block_message()) {
                    if(_outgoing_block_message_cb) {
                        String name = "";
                        if (received_coap_header->uri_path_ptr != NULL &&
                                received_coap_header->uri_path_len > 0) {
                            name.append_raw((char *)received_coap_header->uri_path_ptr,
                                             received_coap_header->uri_path_len);
                        }
                        (*_outgoing_block_message_cb)(name, coap_response->payload_ptr, payload_len);
                    }
                } else {
                    get_value(coap_response->payload_ptr,payload_len);
                }

                coap_response->payload_len = payload_len;
                coap_response->options_list_ptr = sn_nsdl_alloc_options_list(nsdl, coap_response);

                coap_response->options_list_ptr->max_age = max_age();

                if(received_coap_header->options_list_ptr) {
                    if(received_coap_header->options_list_ptr->observe != -1) {
                        if (is_observable()) {
                            uint32_t number = 0;
                            uint8_t observe_option = 0;
                            observe_option = received_coap_header->options_list_ptr->observe;

                            if(START_OBSERVATION == observe_option) {
                                tr_debug("M2MResourceInstance::handle_get_request - Starts Observation");
                                // If the observe length is 0 means register for observation.
                                if(received_coap_header->options_list_ptr->observe != -1) {
                                    number = received_coap_header->options_list_ptr->observe;
                                }
                                if(received_coap_header->token_ptr) {
                                    tr_debug("M2MResourceInstance::handle_get_request - Sets Observation Token to resource");
                                    set_observation_token(received_coap_header->token_ptr,
                                                          received_coap_header->token_len);
                                }
                                // If the observe value is 0 means register for observation.
                                if(number == 0) {
                                    tr_debug("M2MResourceInstance::handle_get_request - Put Resource under Observation");
                                    set_under_observation(true,observation_handler);
                                    M2MBase::add_observation_level(M2MBase::R_Attribute);
                                    coap_response->options_list_ptr->observe = observation_number();
                                }
                            } else if (STOP_OBSERVATION == observe_option) {
                                tr_debug("M2MResourceInstance::handle_get_request - Stops Observation");
                                set_under_observation(false,NULL);
                                M2MBase::remove_observation_level(M2MBase::R_Attribute);
                            }
                        } else {
                            msg_code = COAP_MSG_CODE_RESPONSE_METHOD_NOT_ALLOWED;
                        }
                    }
                }
            }
        }else {
            tr_error("M2MResourceInstance::handle_get_request - Return COAP_MSG_CODE_RESPONSE_METHOD_NOT_ALLOWED");
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

sn_coap_hdr_s* M2MResourceInstance::handle_put_request(nsdl_s *nsdl,
                                               sn_coap_hdr_s *received_coap_header,
                                               M2MObservationHandler *observation_handler,
                                               bool &execute_value_updated)
{
    tr_debug("M2MResourceInstance::handle_put_request()");


        sn_coap_msg_code_e msg_code = COAP_MSG_CODE_RESPONSE_CHANGED; // 2.04
        sn_coap_hdr_s *coap_response = sn_nsdl_build_response(nsdl,
                                                               received_coap_header,
                                                               msg_code);
        // process the PUT if we have registered a callback for it
        if(received_coap_header && coap_response) {
            uint16_t coap_content_type = 0;
            if(received_coap_header->content_format != COAP_CT_NONE) {
                coap_content_type = received_coap_header->content_format;
            }
            if(received_coap_header->options_list_ptr &&
               received_coap_header->options_list_ptr->uri_query_ptr) {
                char *query = (char*)alloc_string_copy(received_coap_header->options_list_ptr->uri_query_ptr,
                                                        received_coap_header->options_list_ptr->uri_query_len);
                if (query){
                    tr_debug("M2MResourceInstance::handle_put_request() - Query %s", query);

                    // if anything was updated, re-initialize the stored notification attributes
                    if (!handle_observation_attribute(query)){
                        tr_debug("M2MResourceInstance::handle_put_request() - Invalid query");
                        msg_code = COAP_MSG_CODE_RESPONSE_BAD_REQUEST; // 4.00
                    }
                    free(query);
                }
            } else if ((operation() & SN_GRS_PUT_ALLOWED) != 0) {
                tr_debug("M2MResourceInstance::handle_put_request() - Request Content-Type %d", coap_content_type);

                if(COAP_CONTENT_OMA_TLV_TYPE == coap_content_type) {
                    msg_code = COAP_MSG_CODE_RESPONSE_UNSUPPORTED_CONTENT_FORMAT;
                } else {
                    bool external_block_store = false;
                    if (block_message()) {
                        block_message()->set_message_info(received_coap_header);
                        if (block_message()->is_block_message()) {
                            external_block_store = true;
                            if(_incoming_block_message_cb) {
                                (*_incoming_block_message_cb)(_block_message_data);
                            }
                            if (block_message()->is_last_block()) {
                                block_message()->clear_values();
                                coap_response->coap_status = COAP_STATUS_PARSER_BLOCKWISE_MSG_RECEIVED;
                            } else {
                                coap_response->coap_status = COAP_STATUS_PARSER_BLOCKWISE_MSG_RECEIVING;
                            }
                            if (block_message()->error_code() != M2MBlockMessage::ErrorNone) {
                                block_message()->clear_values();
                            }
                        }
                    }
                    if (!external_block_store) {
                        set_value(received_coap_header->payload_ptr, received_coap_header->payload_len);
                    }
                    if(received_coap_header->payload_ptr) {
                       tr_debug("M2MResourceInstance::handle_put_request() - Update Resource with new values");
                        if(observation_handler) {
                            String value = "";
                            if (received_coap_header->uri_path_ptr != NULL &&
                                received_coap_header->uri_path_len > 0) {
                                value.append_raw((char*)received_coap_header->uri_path_ptr, received_coap_header->uri_path_len);
                            }
                            execute_value_updated = true;
                        }
                    }
                }
            } else {
                // Operation is not allowed.
                tr_error("M2MResourceInstance::handle_put_request() - COAP_MSG_CODE_RESPONSE_METHOD_NOT_ALLOWED");
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

void M2MResourceInstance::set_resource_observer(M2MResourceCallback *resource)
{
    _resource_callback = resource;
}

uint16_t M2MResourceInstance::object_instance_id() const
{
    return _object_instance_id;
}

M2MBlockMessage* M2MResourceInstance::block_message() const
{
    return _block_message_data;
}

void M2MResourceInstance::set_incoming_block_message_callback(incoming_block_message_callback callback)
{
    // copy the callback object. This will change on next version to be a direct pointer to a interface class,
    // this FPn<> is just too heavy for this usage.
    delete _incoming_block_message_cb;
    _incoming_block_message_cb = new incoming_block_message_callback(callback);

    delete _block_message_data;
    _block_message_data = NULL;
    _block_message_data = new M2MBlockMessage();
}

void M2MResourceInstance::set_outgoing_block_message_callback(outgoing_block_message_callback callback)
{
    delete _outgoing_block_message_cb;
    _outgoing_block_message_cb = new outgoing_block_message_callback(callback);
}

void M2MResourceInstance::set_notification_sent_callback(notification_sent_callback callback)
{
    delete _notification_sent_callback;
    _notification_sent_callback = new notification_sent_callback(callback);
}

void M2MResourceInstance::set_notification_sent_callback(notification_sent_callback_2 callback)
{
    delete _notification_sent_function_pointer;

    _notification_sent_function_pointer = new FP0<void>(callback);
    set_notification_sent_callback(
                notification_sent_callback(_notification_sent_function_pointer, &FP0<void>::call));
}

void M2MResourceInstance::notification_sent()
{
    if (_notification_sent_callback) {
        (*_notification_sent_callback)();
    }
}

M2MResource& M2MResourceInstance::get_parent_resource() const
{
    return _parent_resource;
}

const char* M2MResourceInstance::object_name() const
{
    const M2MObjectInstance& parent_object_instance = _parent_resource.get_parent_object_instance();
    const M2MObject& parent_object = parent_object_instance.get_parent_object();

    return parent_object.name();
}
