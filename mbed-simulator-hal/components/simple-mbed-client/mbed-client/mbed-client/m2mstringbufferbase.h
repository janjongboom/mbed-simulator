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
#ifndef __STRING_BUFFER_BASE_H__
#define __STRING_BUFFER_BASE_H__

#include <stdint.h>
#include <stddef.h>

class StringBufferBase
{
protected:

    // inline version of this produces smaller code
    inline StringBufferBase();

    // all the docs are at template level, as it is the only public API

    bool ensure_space(size_t max_size, size_t required_size) const;

    bool append(char *buff, size_t max_size, char data);

    bool append(char *buff, size_t max_size, const char *data);

    bool append(char *buff, size_t max_size, const char *data, size_t data_len);

    bool append_int(char *buff, size_t max_size, uint16_t data);

    int find_last_of(const char *buff, char search_char) const;

protected:
    //const size_t _max_size;
    size_t _curr_size;
};

inline StringBufferBase::StringBufferBase() : _curr_size(0)
{
}

#endif // !__STRING_BUFFER_BASE_H__
