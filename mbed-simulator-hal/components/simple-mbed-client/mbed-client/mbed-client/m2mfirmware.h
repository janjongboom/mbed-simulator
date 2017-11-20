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
#ifndef M2MFIRMWARE_H
#define M2MFIRMWARE_H

#include "mbed-client/m2mobject.h"

// FORWARD DECLARATION
class M2MResource;
class M2MResourceInstance;

/*! \file m2mfirmware.h
 *  \brief M2MFirmware.
 *  This class represents the Firmware Object model of the LWM2M framework.
 *  It provides an interface for handling the Firmware Object
 *  and all its corresponding resources. There can be only one instance
 *  of a Firmware Object.
 */
class  M2MFirmware : public M2MObject {

friend class M2MInterfaceFactory;

public:

     /**
      * \brief An enum defining all the resources associated with a
      * Firmware Object in the LWM2M framework.
      */
    typedef enum {
        Package,
        PackageUri,
        Update,
        State,
        UpdateSupportedObjects,
        UpdateResult,
        PackageName,
        PackageVersion
    } FirmwareResource;

    /**
     * \brief An enum defining the state of the firmware update.
     */
    typedef enum {
       Idle = 0,
       Downloading,
       Downloaded,
       Updating
    } UpdateState;

    /**
     * \brief An enum defining the result of the firmware update.
     */
    typedef enum {
       Default = 0,
       SuccessfullyUpdated,
       NotEnoughSpace,
       OutOfMemory,
       ConnectionLost,
       CRCCheckFailure,
       UnsupportedPackageType,
       InvalidURI
    } ResultOfUpdate;

private:

    /**
     * Constructor
     */
    M2MFirmware();

    // Prevents the use of assignment operator.
    M2MFirmware& operator=( const M2MFirmware& /*other*/ );

    // Prevents the use of copy constructor.
    M2MFirmware( const M2MFirmware& /*other*/ );

    /**
     * Destructor
     */
    virtual ~M2MFirmware();

    static M2MFirmware* get_instance();

public:

    /**
     * \brief Deletes a M2MFirmware instance.
     */
    static void delete_instance();

    /**
     * \brief Creates a new resource for a given resource enum.
     * \param resource With this function, the following resources can be created:
     * 'PackageUri', 'PackageName','PackageVersion'.
     * \param value The value to be set on the resource, in string format.
     * \return M2MResource if created successfully, else NULL.
     */
    M2MResource* create_resource(FirmwareResource resource, const String &value);

    /**
     * \brief Creates a new resource for a given resource enum.
     * \param resource With this function, the following resources can be created:
     * 'State','UpdateSupportedObjects','UpdateResult'.
     * \param value The value to be set on the resource, in integer format.
     * \return M2MResource if created successfully, else NULL.
     */
    M2MResource* create_resource(FirmwareResource resource, int64_t value);

    /**
     * \brief Deletes a resource with a given resource enum.
     * Mandatory resources cannot be deleted.
     * \param resource The name of the resource to be deleted.
     * \return True if deleted, else false.
     */
    bool delete_resource(FirmwareResource resource);

    /**
     * \brief Sets a value of a given resource enum.
     * \param resource With this function, a value can be set on the following resources:
     * 'Package', 'PackageUri', 'PackageName','PackageVersion'.
     * \param value The value to be set on the resource, in string format.
     * \return True if successfully set, else false.
     */
    bool set_resource_value(FirmwareResource resource,
                            const String &value);

    /**
     * \brief Sets a value of a given resource enum.
     * \param resource With this function, a value can be set for the following resources:
     * 'State','UpdateSupportedObjects','UpdateResult'.
     * \param value The value to be set on the resource, in integer format.
     * \return True if successfully set, else false.
     */
    bool set_resource_value(FirmwareResource resource,
                            int64_t value);

    /**
     * \brief Sets a value of a given resource enum.
     * \param resource With this function, a value can be set for the following resources:
     * 'Package'.
     * \param value The value to be set on the resource, in uint8_t format.
     * \param size The size of the buffer value to be set on the resource.
     * \return True if successfully set, else false.
     */
    bool set_resource_value(FirmwareResource resource,
                            const uint8_t *value,
                            const uint32_t length);

    /**
     * \brief Returns a value of a given resource enum, in string format.
     * \param resource With this function, the following resources can return a value:
     * 'PackageUri', 'PackageName','PackageVersion'.
     * \return The value associated with that resource, if the key is not valid it returns NULL.
     */
    String resource_value_string(FirmwareResource resource) const;

    /**
     * \brief Returns a value of a given resource key name, in integer format.
     * \param resource With this function, the following resources can return a value:
     * 'State','UpdateSupportedObjects','UpdateResult'.
     * \return The value associated with that resource. If the resource is not valid -1 is returned.
     */
    int64_t resource_value_int(FirmwareResource resource) const;

    /**
     * \brief Populates the data buffer and returns the size of the buffer.
     * \param resource With this function, the following resources can return a value:
     * 'Package'.
     * \param [OUT]data The data buffer containing the value.
     * Tha value of the pointer MUST be set as NULL before calling this function unless it has been
     * allocated using malloc. In that case the data is freed when calling this function.
     * The buffer is allocated using malloc when this function is called and MUST be passed to function free after use.
     * \return The size of the buffer populated.
     */
    uint32_t resource_value_buffer(FirmwareResource resource,
                                   uint8_t *&data) const;

    /**
     * \brief Returns whether a resource instance with a given resource enum exists or not.
     * \param resource The resource enum.
     * \return True if at least one instance exists, else false.
     */
    bool is_resource_present(FirmwareResource resource) const;

    /**
     * \brief Returns the number of resources for a whole firmware object.
     * \return Total number of resources belonging to the firmware object.
     */
    uint16_t total_resource_count() const;

    /**
     * \brief Returns the number of resources for a given resource enum.
     * \param resource The resource enum.
     * \return The number of resources for a given resource enum. Returns 1 for the
     * mandatory resources. Can be 0 as well if no instances exist for an
     * optional resource.
     */
    uint16_t per_resource_count(FirmwareResource resource) const;


private:

    M2MResource* get_resource(FirmwareResource resource) const;

    static const char* resource_name(FirmwareResource resource);

    void create_mandatory_resources();

    bool check_value_range(FirmwareResource resource, const int64_t value) const;

private :

    M2MObjectInstance*    _firmware_instance;     //Not owned

protected:

    static M2MFirmware*     _instance;

    friend class Test_M2MFirmware;
    friend class Test_M2MInterfaceFactory;
};


#endif // M2MFIRMWARE_H
