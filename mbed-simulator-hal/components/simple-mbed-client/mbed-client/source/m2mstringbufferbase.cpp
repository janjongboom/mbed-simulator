/*
 * Copyright (c) 2016 ARM Limited. All rights reserved.
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

#include "mbed-client/m2mstringbufferbase.h"

#include "mbed-client/m2mstring.h"

#include <assert.h>
#include <string.h>


bool StringBufferBase::ensure_space(size_t max_size, size_t required_size) const
{
    const size_t space_left = max_size - _curr_size;

    bool space_available = false;

    if (required_size <= space_left) {

        space_available = true;
    }
    return space_available;
}

bool StringBufferBase::append(char *buff, size_t max_size, char data)
{
    bool space_available = ensure_space(max_size, 1 + 1); // there must be space for trailing zero too
    if (space_available) {
        buff[_curr_size++] = data;
        buff[_curr_size] = '\0';
        assert(_curr_size < max_size);
    }
    return space_available;
}

bool StringBufferBase::append(char *buff, size_t max_size, const char *data)
{

    const size_t string_len = strlen(data);
    bool space_available = ensure_space(max_size, string_len + 1);
    if (space_available) {
        memcpy(buff + _curr_size, data, string_len + 1); // copy the zero terminator too
        _curr_size += string_len;
        assert(_curr_size < max_size);
    }
    return space_available;
}

bool StringBufferBase::append(char *buff, size_t max_size, const char *data, size_t data_len)
{
    bool space_available = true;
    if (data_len > 0) {
        space_available = ensure_space(max_size, data_len + 1);
        if (space_available) {
            memcpy(buff + _curr_size, data, data_len);
            _curr_size += data_len;
            // Todo: should the code actually check, if the data already contained zero or not?
            buff[_curr_size] = '\0';
            assert(_curr_size < max_size);
        }
    }
    return space_available;
}

bool StringBufferBase::append_int(char *buff, size_t max_size, uint16_t data)
{
    // max len of "-9223372036854775808" plus zero termination
    char conv_buff[20+1];

    // re-use the String's functionality, a more optimal version would use snprintf() or int size specific converter
    int len = m2m::itoa_c(data, conv_buff);

    return append(buff, max_size, conv_buff, len);
}

int StringBufferBase::find_last_of(const char *buff, char search_char) const
{
    int last_index = -1;
    // search from the end of string, return upon first found matching char
    for (int index = _curr_size; index >= 0; index--) {
        if (buff[index] == search_char) {
            last_index = index;
            break;
        }
    }

    return last_index;
}
