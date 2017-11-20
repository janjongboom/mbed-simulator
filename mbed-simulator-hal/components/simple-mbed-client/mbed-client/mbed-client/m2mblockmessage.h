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
#ifndef M2MBLOCKMESSAGE_H
#define M2MBLOCKMESSAGE_H

#include "ns_types.h"
#include "sn_coap_header.h"

/*! \file m2mblockmessage.h
 *  \brief M2MBlockMessage.
 *  This class contains the data of an incoming block message.
 */
class M2MBlockMessage {

public:

    /**
     * \brief An enum defining different kinds of errors
     * that can occur during the block-wise operation.
     */
    typedef enum {
        ErrorNone = 0,
        EntityTooLarge
    }Error;

    /**
    * Constructor.
    */
    M2MBlockMessage();

    /**
    * Destructor.
    */
    virtual ~M2MBlockMessage();

    /**
     * \brief Store the data from a CoAP message.
     * \param coap_header The message to parse.
     */
    void set_message_info(sn_coap_hdr_s *coap_header);

    /**
     * \brief Clear values.
     */
    void clear_values();

    /**
     * \brief Check if the message is a block message.
     * \param coap_header The message to check.
     * \return True if block message, else false.
     */
    bool is_block_message() const;

    /**
     * \brief Returns the number of an incoming block.
     * \return Block number, starting from 0.
     */
    uint16_t block_number() const;

    /**
     * \brief Returns the total size of the message.
     * \return The total size in bytes.
     */
    uint32_t total_message_size() const;

    /**
     * \brief Check if last block.
     * \return True if last block, else false.
     */
    bool is_last_block() const;

    /**
     * \brief Returns the payload of the message.
     * \return The message payload.
     */
    uint8_t* block_data() const;

    /**
     * \brief Returns the length of the payload.
     * \return The payload length.
     */
    uint32_t block_data_len() const;

    /**
     * \brief Returns an error code.
     * \return Error code.
     */
    Error error_code() const;

private:
    uint8_t     *_block_data_ptr;
    uint32_t    _total_message_size;
    uint16_t    _block_data_len;
    uint16_t    _block_number;
    Error       _error_code;
    bool        _is_last_block;
    bool        _is_block_message;
};

#endif // M2MBLOCKMESSAGE_H
