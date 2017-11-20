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
#ifndef __STRING_BUFFER_H__
#define __STRING_BUFFER_H__

#include "mbed-client/m2mstringbufferbase.h"

#include <assert.h>
#include <stddef.h>

template <int SIZE>
class StringBuffer : private StringBufferBase
{
public:
    /**
     * Initialize a empty buffer with zero length and zero content.
     */
    inline StringBuffer();

    //
    // This is not implemented on purpose, as the given string may conflict with
    // templated size. Otoh, if we used compile time assert, the overflow
    // could be prevented at compile time.
    //
    // inline StringBuffer(const char *initial_string);

    /**
     * Verify, if the buffer has still room for given amount of bytes.
     * Note: the given size value must include the zero terminator as it is not
     * implicitly taken into account for.
     */
    bool ensure_space(size_t required_size) const;

    /**
     * Append given char to end of string.
     * Return false if the buffer would overflow, true otherwise.
     */
    bool append(char data);

    /**
     * Append given zero terminated string to end of buffer.
     *
     * Return false if the buffer would overflow, true otherwise.
     *
     * Note: the whole string, including the zero terminator must fit
     * to buffer or the append operation is not done and false is returned.
     */
    bool append(const char *data);

    /**
     * Append given block of chars to end of buffer.
     *
     * Return false if the buffer would overflow, true otherwise.
     *
     * Note: the whole string, including the zero terminator must fit
     * to buffer or the append operation is not done and false is returned.
     */
    bool append(const char *data, size_t data_len);

    /**
     * Convert given uint16_t into string representation and add it to the
     * end of buffer.
     *
     * Note: the whole string, including the zero terminator must fit
     * to buffer or the append operation is not done and false is returned.
     */
    bool append_int(uint16_t data);

    /**
     * Get the amount of bytes added to the buffer.
     *
     * Note: the size does not include the terminating zero, so this is
     * functionally equal to strlen().
     */
    inline size_t get_size() const;

    // API functionality copied from m2mstring:

    // find the index of last occurance of given char in string, or negative if not found
    int find_last_of(char search_char) const;

    /**
     * Get a read only pointer to the data.
     */
    inline const char* c_str() const;

    // Add this only if needed
    //inline char* c_str();
private:
    char _buff[SIZE];
};

template <int SIZE>
inline StringBuffer<SIZE>::StringBuffer()
{
    // actually a assert_compile() would be better as this is completely a code problem
    assert(SIZE > 0);

    _buff[0] = '\0';
}

template <int SIZE>
bool StringBuffer<SIZE>::ensure_space(size_t required_size) const
{
    return StringBufferBase::ensure_space(SIZE, required_size);
}

template <int SIZE>
bool StringBuffer<SIZE>::append(const char *data)
{
    return StringBufferBase::append(_buff, SIZE, data);
}

template <int SIZE>
bool StringBuffer<SIZE>::append(const char *data, size_t data_len)
{
    return StringBufferBase::append(_buff, SIZE, data, data_len);
}

template <int SIZE>
inline bool StringBuffer<SIZE>::append(char data)
{
    return StringBufferBase::append(_buff, SIZE, data);
}

template <int SIZE>
bool StringBuffer<SIZE>::append_int(uint16_t data)
{
    return StringBufferBase::append_int(_buff, SIZE, data);
}

template <int SIZE>
int StringBuffer<SIZE>::find_last_of(char search_char) const
{
    return StringBufferBase::find_last_of(_buff, search_char);
}

template <int SIZE>
inline const char* StringBuffer<SIZE>::c_str() const
{
    return _buff;
}

template <int SIZE>
inline size_t StringBuffer<SIZE>::get_size() const
{
    return _curr_size;
}

#endif // !__STRING_BUFFER_H__
