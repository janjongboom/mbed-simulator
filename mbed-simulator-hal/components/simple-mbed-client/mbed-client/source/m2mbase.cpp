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

#include "mbed-client/m2mbase.h"
#include "mbed-client/m2mobservationhandler.h"
#include "mbed-client/m2mconstants.h"
#include "mbed-client/m2mtimer.h"

#include "mbed-client/m2mobject.h"
#include "mbed-client/m2mobjectinstance.h"
#include "mbed-client/m2mresource.h"

#include "include/m2mreporthandler.h"
#include "include/nsdlaccesshelper.h"
#include "mbed-trace/mbed_trace.h"
#include <assert.h>
#include <ctype.h>
#include <string.h>
#include <stdlib.h>

#define TRACE_GROUP "mClt"

M2MBase::M2MBase(const String& resource_name,
                 M2MBase::Mode mode,
                 const String &resource_type,
                 char *path,
                 bool external_blockwise_store)
:
  _sn_resource(NULL),
  _report_handler(NULL),
  _observation_handler(NULL),
  _token(NULL),
  _function_pointer(NULL),
  _value_updated_callback(NULL),
  _observation_number(0),
  _token_length(0),
  _observation_level(M2MBase::None),
  _is_under_observation(false)
{
    // Checking the name length properly, i.e returning error is impossible from constructor without exceptions
    assert(resource_name.length() <= MAX_ALLOWED_STRING_LENGTH);

    _sn_resource = (lwm2m_parameters_s*)memory_alloc(sizeof(lwm2m_parameters_s));
    if(_sn_resource) {
        memset(_sn_resource, 0, sizeof(lwm2m_parameters_s));
        _sn_resource->free_on_delete = true;
        _sn_resource->dynamic_resource_params =
                (sn_nsdl_dynamic_resource_parameters_s*)memory_alloc(sizeof(sn_nsdl_dynamic_resource_parameters_s));
        if(_sn_resource->dynamic_resource_params) {
            memset(_sn_resource->dynamic_resource_params,
                   0, sizeof(sn_nsdl_dynamic_resource_parameters_s));
            _sn_resource->dynamic_resource_params->static_resource_parameters =
                    (sn_nsdl_static_resource_parameters_s*)memory_alloc(sizeof(sn_nsdl_static_resource_parameters_s));

            // Set callback function in case of dynamic resource
            if (M2MBase::Dynamic == mode) {
                _sn_resource->dynamic_resource_params->sn_grs_dyn_res_callback = __nsdl_c_callback;
            }

            if(_sn_resource->dynamic_resource_params->static_resource_parameters) {
                // Cast const away to able to compile using MEMORY_OPTIMIZED_API flag
                sn_nsdl_static_resource_parameters_s *params =
                        const_cast<sn_nsdl_static_resource_parameters_s *>(_sn_resource->dynamic_resource_params->static_resource_parameters);
                memset(params, 0, sizeof(sn_nsdl_static_resource_parameters_s));
                const size_t len = strlen(resource_type.c_str());
                if (len > 0) {
                    params->resource_type_ptr = (char*)
                            alloc_string_copy((uint8_t*) resource_type.c_str(), len);
                }
                params->path = (uint8_t*)path;
                params->pathlen = strlen(path);


                params->mode = (const uint8_t)mode;
                params->free_on_delete = true;
                params->external_memory_block = external_blockwise_store;
                _sn_resource->dynamic_resource_params->static_resource_parameters = params;
            }
        }

        _sn_resource->name = stringdup((char*)resource_name.c_str());
        _sn_resource->dynamic_resource_params->publish_uri = true;
        _sn_resource->dynamic_resource_params->free_on_delete = true;

        if(is_integer(resource_name) && resource_name.size() <= MAX_ALLOWED_STRING_LENGTH) {
            _sn_resource->name_id = strtoul(resource_name.c_str(), NULL, 10);
            if(_sn_resource->name_id > 65535){
                _sn_resource->name_id = -1;
            }
        } else {
            _sn_resource->name_id = -1;
        }
    }
}

M2MBase::M2MBase(const lwm2m_parameters_s *s):
    _sn_resource((lwm2m_parameters_s*) s),
    _report_handler(NULL),
    _observation_handler(NULL),
    _token(NULL),
    _function_pointer(NULL),
    _value_updated_callback(NULL),
    _observation_number(0),
    _token_length(0),
    _observation_level(M2MBase::None),
    _is_under_observation(false)
{
    // Set callback function in case of dynamic resource
    if (M2MBase::Dynamic == _sn_resource->dynamic_resource_params->static_resource_parameters->mode) {
        _sn_resource->dynamic_resource_params->sn_grs_dyn_res_callback = __nsdl_c_callback;
    }
}

M2MBase::~M2MBase()
{
    delete _report_handler;
    free_resources();
    free(_token);
    delete _function_pointer;
    delete _value_updated_callback;
}

char* M2MBase::create_path(const M2MObject &parent, uint16_t object_instance)
{
    StringBuffer<5> obj_inst_id;
    obj_inst_id.append_int(object_instance);

    return create_path(parent, obj_inst_id.c_str());
}

char* M2MBase::create_path(const M2MObject &parent, const char *name)
{
    char * result = NULL;
    StringBuffer<(MAX_NAME_SIZE * 2 + (2 + 1))> path;

    const char* obj_name = parent.name();

    // XXX: ensure space
    path.append(obj_name);
    path.append('/');
    path.append(name);

    result = stringdup(path.c_str());
    return result;
}

char* M2MBase::create_path(const M2MResource &parent, uint16_t resource_instance)
{
    StringBuffer<5> res_inst;
    res_inst.append_int(resource_instance);

    return create_path(parent, res_inst.c_str());
}

char* M2MBase::create_path(const M2MResource &parent, const char *name)
{
    char * result = NULL;
    StringBuffer<(MAX_NAME_SIZE * 4 + (3 + 1))> path;
    M2MObjectInstance& parent_object_instance = parent.get_parent_object_instance();
    M2MObject& parent_object = parent_object_instance.get_parent_object();

    const char* obj_name = parent_object.name();

    // Note: the parent_object_instance.name() contains name of its parent object, not the name of instance,
    // so we need to skip that here
    const uint16_t obj_inst_id = parent_object_instance.instance_id();

    const char* resource_name = parent.name();

    // XXX: ensure space
    path.append(obj_name);
    path.append('/');
    path.append_int(obj_inst_id);
    path.append('/');
    path.append(resource_name);
    path.append('/');
    path.append(name);

    result = stringdup(path.c_str());
    return result;
}

char* M2MBase::create_path(const M2MObjectInstance &parent, const char *name)
{
    char * result = NULL;
    StringBuffer<(MAX_NAME_SIZE * 3 + (2 + 1))> path;
    M2MObject& parent_object = parent.get_parent_object();

    const char* obj_name = parent_object.name();
    // Note: the parent_object_instance.name() contains name of its parent object, not the name of instance,
    // so we need to skip that here
    const uint16_t obj_inst_id = parent.instance_id();

    // XXX: ensure space
    path.append(obj_name);
    path.append('/');
    path.append_int(obj_inst_id);
    path.append('/');
    path.append(name);

    result = stringdup(path.c_str());
    return result;
}


void M2MBase::set_operation(M2MBase::Operation opr)
{
    // If the mode is Static, there is only GET_ALLOWED supported.
    if(M2MBase::Static == mode()) {
        _sn_resource->dynamic_resource_params->access = M2MBase::GET_ALLOWED;
    } else {
        _sn_resource->dynamic_resource_params->access = opr;
    }
}

#ifndef MEMORY_OPTIMIZED_API
void M2MBase::set_interface_description(const char *desc)
{
    assert(_sn_resource->dynamic_resource_params->static_resource_parameters->free_on_delete);
    free(_sn_resource->dynamic_resource_params->static_resource_parameters->interface_description_ptr);
    _sn_resource->dynamic_resource_params->static_resource_parameters->interface_description_ptr = NULL;
    const size_t len = strlen(desc);
    if (len > 0 ) {
        _sn_resource->dynamic_resource_params->static_resource_parameters->interface_description_ptr =
                (char*)alloc_string_copy((uint8_t*) desc, len);
    }
}

void M2MBase::set_interface_description(const String &desc)
{
    assert(_sn_resource->dynamic_resource_params->static_resource_parameters->free_on_delete);
    set_interface_description(desc.c_str());
}

void M2MBase::set_resource_type(const String &res_type)
{
    assert(_sn_resource->dynamic_resource_params->static_resource_parameters->free_on_delete);
    set_resource_type(res_type.c_str());
}

void M2MBase::set_resource_type(const char *res_type)
{
    assert(_sn_resource->dynamic_resource_params->static_resource_parameters->free_on_delete);
    free(_sn_resource->dynamic_resource_params->static_resource_parameters->resource_type_ptr);
    _sn_resource->dynamic_resource_params->static_resource_parameters->resource_type_ptr = NULL;
    const size_t len = strlen(res_type);
    if (len > 0) {
        _sn_resource->dynamic_resource_params->static_resource_parameters->resource_type_ptr = (char*)
                alloc_string_copy((uint8_t*) res_type, len);
    }
}
#endif

void M2MBase::set_coap_content_type(const uint8_t con_type)
{
    _sn_resource->dynamic_resource_params->coap_content_type = con_type;
}

void M2MBase::set_observable(bool observable)
{
    _sn_resource->dynamic_resource_params->observable = observable;
}

void M2MBase::add_observation_level(M2MBase::Observation obs_level)
{
    _observation_level = (M2MBase::Observation)(_observation_level | obs_level);
}

void M2MBase::remove_observation_level(M2MBase::Observation obs_level)
{
    _observation_level = (M2MBase::Observation)(_observation_level & ~obs_level);
}

void M2MBase::set_observation_handler(M2MObservationHandler *handler)
{
    tr_debug("M2MBase::set_observation_handler - handler: 0x%p", (void*)handler);
    _observation_handler = handler;
}


void M2MBase::set_under_observation(bool observed,
                                    M2MObservationHandler *handler)
{
    tr_debug("M2MBase::set_under_observation - observed: %d", observed);
    tr_debug("M2MBase::set_under_observation - base_type: %d", base_type());
    _is_under_observation = observed;
    _observation_handler = handler;
    if (handler) {
        if (base_type() != M2MBase::ResourceInstance) {
            // Create report handler only if it does not exist and one wants observation
            // This saves 76 bytes of memory on most usual case.
            if (observed) {
                if(!_report_handler) {
                    _report_handler = new M2MReportHandler(*this);
                }
            }
            if (_report_handler) {
                _report_handler->set_under_observation(observed);
            }
        }
    } else {
        delete _report_handler;
        _report_handler = NULL;
    }
}

void M2MBase::set_observation_token(const uint8_t *token, const uint8_t length)
{
     free(_token);
     _token = NULL;
     _token_length = 0;

    if( token != NULL && length > 0 ) {
        _token = alloc_string_copy((uint8_t *)token, length);
        if(_token) {
            _token_length = length;
        }
    }
}

void M2MBase::set_instance_id(const uint16_t inst_id)
{
    _sn_resource->instance_id = inst_id;
}

void M2MBase::set_observation_number(const uint16_t /*observation_number*/)
{
}

void M2MBase::set_max_age(const uint32_t max_age)
{
    _sn_resource->max_age = max_age;
}

M2MBase::BaseType M2MBase::base_type() const
{
    return (M2MBase::BaseType)_sn_resource->base_type;
}

M2MBase::Operation M2MBase::operation() const
{
    return (M2MBase::Operation)_sn_resource->dynamic_resource_params->access;
}

const char* M2MBase::name() const
{
    return _sn_resource->name;
}

int32_t M2MBase::name_id() const
{
    return _sn_resource->name_id;
}

uint16_t M2MBase::instance_id() const
{
    return _sn_resource->instance_id;
}

const char* M2MBase::interface_description() const
{
    return (reinterpret_cast<char*>(
        _sn_resource->dynamic_resource_params->static_resource_parameters->interface_description_ptr));
}

const char* M2MBase::resource_type() const
{
    return (reinterpret_cast<char*>(
        _sn_resource->dynamic_resource_params->static_resource_parameters->resource_type_ptr));
}

const char* M2MBase::uri_path() const
{
    return (reinterpret_cast<char*>(
        _sn_resource->dynamic_resource_params->static_resource_parameters->path));
}

uint8_t M2MBase::coap_content_type() const
{
    return _sn_resource->dynamic_resource_params->coap_content_type;
}

bool M2MBase::is_observable() const
{
    return _sn_resource->dynamic_resource_params->observable;
}

M2MBase::Observation M2MBase::observation_level() const
{
    return _observation_level;
}

void M2MBase::get_observation_token(uint8_t *&token, uint32_t &token_length)
{
    token_length = 0;
    free(token);
    if (_token) {
        token = alloc_string_copy((uint8_t *)_token, _token_length);
        if(token) {
            token_length = _token_length;
        }
    }
}

M2MBase::Mode M2MBase::mode() const
{
    return (M2MBase::Mode)_sn_resource->dynamic_resource_params->static_resource_parameters->mode;
}

uint16_t M2MBase::observation_number() const
{
    return _observation_number;
}

uint32_t M2MBase::max_age() const
{
    return _sn_resource->max_age;
}

bool M2MBase::handle_observation_attribute(const char *query)
{
    tr_debug("M2MBase::handle_observation_attribute - under observation(%d)", is_under_observation());
    bool success = false;
    // Create handler if not already exists. Client must able to parse write attributes even when
    // observation is not yet set
    if (!_report_handler) {
        _report_handler = new M2MReportHandler(*this);
    }

    success = _report_handler->parse_notification_attribute(query,base_type());
    if (success) {
        if (is_under_observation()) {
            _report_handler->set_under_observation(true);
        }
     } else {
        _report_handler->set_default_values();
    }
    return success;
}

void M2MBase::observation_to_be_sent(m2m::Vector<uint16_t> changed_instance_ids, bool send_object)
{
    //TODO: Move this to M2MResourceInstance
    if(_observation_handler) {
       _observation_number++;
       _observation_handler->observation_to_be_sent(this,
                                                    _observation_number,
                                                    changed_instance_ids,
                                                    send_object);
    }
}

void M2MBase::set_base_type(M2MBase::BaseType type)
{
    assert(_sn_resource->free_on_delete);
    _sn_resource->base_type = type;
}

sn_coap_hdr_s* M2MBase::handle_get_request(nsdl_s */*nsdl*/,
                                           sn_coap_hdr_s */*received_coap_header*/,
                                           M2MObservationHandler */*observation_handler*/)
{
    //Handled in M2MResource, M2MObjectInstance and M2MObject classes
    return NULL;
}

sn_coap_hdr_s* M2MBase::handle_put_request(nsdl_s */*nsdl*/,
                                           sn_coap_hdr_s */*received_coap_header*/,
                                           M2MObservationHandler */*observation_handler*/,
                                           bool &)
{
    //Handled in M2MResource, M2MObjectInstance and M2MObject classes
    return NULL;
}

sn_coap_hdr_s* M2MBase::handle_post_request(nsdl_s */*nsdl*/,
                                            sn_coap_hdr_s */*received_coap_header*/,
                                            M2MObservationHandler */*observation_handler*/,
                                            bool &,
                                            sn_nsdl_addr_s *)
{
    //Handled in M2MResource, M2MObjectInstance and M2MObject classes
    return NULL;
}

void *M2MBase::memory_alloc(uint32_t size)
{
    if(size)
        return malloc(size);
    else
        return 0;
}

void M2MBase::memory_free(void *ptr)
{
    free(ptr);
}

char* M2MBase::alloc_string_copy(const char* source)
{
    assert(source != NULL);

    // Note: the armcc's libc does not have strdup, so we need to implement it here
    const size_t len = strlen(source);

    return (char*)alloc_string_copy((uint8_t*)source, len);
}

uint8_t* M2MBase::alloc_string_copy(const uint8_t* source, uint32_t size)
{
    assert(source != NULL);

    uint8_t* result = (uint8_t*)memory_alloc(size + 1);
    if (result) {
        memcpy(result, source, size);
        result[size] = '\0';
    }
    return result;
}

uint8_t* M2MBase::alloc_copy(const uint8_t* source, uint32_t size)
{
    assert(source != NULL);

    uint8_t* result = (uint8_t*)memory_alloc(size);
    if (result) {
        memcpy(result, source, size);
    }
    return result;
}

bool M2MBase::validate_string_length(const String &string, size_t min_length, size_t max_length)
{
    bool valid = false;

    const size_t len = string.length();
    if ((len >= min_length) && (len <= max_length)) {
        valid = true;
    }

    return valid;
}

bool M2MBase::validate_string_length(const char* string, size_t min_length, size_t max_length)
{
    bool valid = false;

    if (string != NULL) {
        const size_t len = strlen(string);
        if ((len >= min_length) && (len <= max_length)) {
            valid = true;
        }
    }

    return valid;
}

M2MReportHandler* M2MBase::create_report_handler()
{
    if (!_report_handler) {
        _report_handler = new M2MReportHandler(*this);
    }
    return _report_handler;
}

M2MReportHandler* M2MBase::report_handler()
{
    return _report_handler;
}

M2MObservationHandler* M2MBase::observation_handler()
{
    return _observation_handler;
}

void M2MBase::set_register_uri(bool register_uri)
{
    _sn_resource->dynamic_resource_params->publish_uri = register_uri;
}

bool M2MBase::register_uri()
{
    return _sn_resource->dynamic_resource_params->publish_uri;
}

bool M2MBase::is_integer(const String &value)
{
    const char *s = value.c_str();
    if(value.empty() || ((!isdigit(s[0])) && (s[0] != '-') && (s[0] != '+'))) {
        return false;
    }
    char * p;
    strtol(value.c_str(), &p, 10);
    return (*p == 0);
}

bool M2MBase::is_integer(const char *value)
{
    assert(value != NULL);

    if((strlen(value) < 1) || ((!isdigit(value[0])) && (value[0] != '-') && (value[0] != '+'))) {
        return false;
    }
    char * p;
    strtol(value, &p, 10);
    return (*p == 0);
}

bool M2MBase::is_under_observation() const
{
    return _is_under_observation;
}

void M2MBase::set_value_updated_function(value_updated_callback callback)
{
    delete _value_updated_callback;
    // XXX: create a copy of the copy of callback object. Perhaps it would better to
    // give a reference as parameter and just store that, as it would save some memory.
    _value_updated_callback = new value_updated_callback(callback);
}

void M2MBase::set_value_updated_function(value_updated_callback2 callback)
{
    delete _function_pointer;
    _function_pointer = new FP1<void, const char*>(callback);
    set_value_updated_function(value_updated_callback(_function_pointer,
                                                      &FP1<void, const char*>::call));
}

bool M2MBase::is_value_updated_function_set()
{
    return (_value_updated_callback) ? true : false;
}

void M2MBase::execute_value_updated(const String& name)
{
    if(_value_updated_callback) {
        (*_value_updated_callback)(name.c_str());
    }
}

bool M2MBase::build_path(StringBuffer<MAX_PATH_SIZE> &buffer, const char *s1, uint16_t i1, const char *s2, uint16_t i2)
{

    if(!buffer.ensure_space(strlen(s1) + strlen(s2) + (MAX_INSTANCE_SIZE * 2) + 3 + 1)){
        return false;
    }

    buffer.append(s1);
    buffer.append('/');
    buffer.append_int(i1);
    buffer.append('/');
    buffer.append(s2);
    buffer.append('/');
    buffer.append_int(i2);

    return true;

}

bool M2MBase::build_path(StringBuffer<MAX_PATH_SIZE_2> &buffer, const char *s1, uint16_t i1, const char *s2)
{
    if(!buffer.ensure_space(strlen(s1) + strlen(s2) + MAX_INSTANCE_SIZE + 2 + 1)){
        return false;
    }

    buffer.append(s1);
    buffer.append('/');
    buffer.append_int(i1);
    buffer.append('/');
    buffer.append(s2);

    return true;
}

bool M2MBase::build_path(StringBuffer<MAX_PATH_SIZE_3> &buffer, const char *s1, uint16_t i1, uint16_t i2)
{
    if(!buffer.ensure_space(strlen(s1) + (MAX_INSTANCE_SIZE * 2) + 2 + 1)){
        return false;
    }

    buffer.append(s1);
    buffer.append('/');
    buffer.append_int(i1);
    buffer.append('/');
    buffer.append_int(i2);

    return true;
}

bool M2MBase::build_path(StringBuffer<MAX_PATH_SIZE_4> &buffer, const char *s1, uint16_t i1)
{
    if(!buffer.ensure_space(strlen(s1) + MAX_INSTANCE_SIZE + 1 + 1)){
        return false;
    }

    buffer.append(s1);
    buffer.append('/');
    buffer.append_int(i1);

    return true;
}

char* M2MBase::stringdup(const char* src)
{
    assert(src != NULL);

    const size_t len = strlen(src) + 1;

    char *dest = (char*)malloc(len);

    if (dest) {
        memcpy(dest, src, len);
    }
    return dest;
}

void M2MBase::free_resources()
{
    // remove the nsdl structures from the nsdlinterface's lists.
    if (_observation_handler) {
        _observation_handler->resource_to_be_deleted(this);
    }

    if (_sn_resource->dynamic_resource_params->static_resource_parameters->free_on_delete) {
        sn_nsdl_static_resource_parameters_s *params =
                const_cast<sn_nsdl_static_resource_parameters_s *>(_sn_resource->dynamic_resource_params->static_resource_parameters);

        free(params->path);
        free(params->resource);
        free(params->resource_type_ptr);
        free(params->interface_description_ptr);
        free(params);
    }
    if (_sn_resource->dynamic_resource_params->free_on_delete) {
        free(_sn_resource->dynamic_resource_params);
    }

    if (_sn_resource->free_on_delete) {
        free(_sn_resource->name);
        free(_sn_resource);
    }
}

size_t M2MBase::resource_name_length() const
{
    return strlen(_sn_resource->name);
}

sn_nsdl_dynamic_resource_parameters_s* M2MBase::get_nsdl_resource()
{
    return _sn_resource->dynamic_resource_params;
}
