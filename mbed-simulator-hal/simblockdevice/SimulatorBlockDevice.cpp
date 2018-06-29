/* mbed Microcontroller Library
 * Copyright (c) 2018 ARM Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include "SimulatorBlockDevice.h"
#include "emscripten.h"


SimulatorBlockDevice::SimulatorBlockDevice(const char *keyName, bd_size_t size, bd_size_t block)
    : _key_name(keyName), _read_size(block), _program_size(block), _erase_size(block)
    , _count(size / block)
{
    MBED_ASSERT(_count * _erase_size == size);
}

SimulatorBlockDevice::SimulatorBlockDevice(const char *keyName, bd_size_t size, bd_size_t read, bd_size_t program, bd_size_t erase)
    : _key_name(keyName), _read_size(read), _program_size(program), _erase_size(erase)
    , _count(size / erase)
{
    MBED_ASSERT(_count * _erase_size == size);
}

SimulatorBlockDevice::~SimulatorBlockDevice()
{
}

int SimulatorBlockDevice::init()
{
    // JS cannot handle 64 bit integers...
    uint32_t size = static_cast<uint32_t>(_count * _read_size);

    EM_ASM_({
        window.MbedJSHal.blockdevice.init(Pointer_stringify($0), $1);
    }, _key_name, size);

    return BD_ERROR_OK;
}

int SimulatorBlockDevice::deinit()
{
    return BD_ERROR_OK;
}

bd_size_t SimulatorBlockDevice::get_read_size() const
{
    return _read_size;
}

bd_size_t SimulatorBlockDevice::get_program_size() const
{
    return _program_size;
}

bd_size_t SimulatorBlockDevice::get_erase_size() const
{
    return _erase_size;
}

bd_size_t SimulatorBlockDevice::get_erase_size(bd_addr_t addr) const
{
    return _erase_size;
}

bd_size_t SimulatorBlockDevice::size() const
{
    return _count * _erase_size;
}

int SimulatorBlockDevice::read(void *b, bd_addr_t addr, bd_size_t size)
{
    MBED_ASSERT(is_valid_read(addr, size));
    uint8_t *buffer = static_cast<uint8_t*>(b);

    size_t addr_32 = static_cast<uint32_t>(addr);
    size_t size_32 = static_cast<uint32_t>(size);

    EM_ASM_({
        window.MbedJSHal.blockdevice.read(Pointer_stringify($0), $1, $2, $3);
    }, _key_name, buffer, addr_32, size_32);

    return 0;
}

int SimulatorBlockDevice::program(const void *b, bd_addr_t addr, bd_size_t size)
{
    MBED_ASSERT(is_valid_program(addr, size));
    const uint8_t *buffer = static_cast<const uint8_t*>(b);

    size_t addr_32 = static_cast<uint32_t>(addr);
    size_t size_32 = static_cast<uint32_t>(size);

    EM_ASM_({
        window.MbedJSHal.blockdevice.program(Pointer_stringify($0), $1, $2, $3);
    }, _key_name, buffer, addr_32, size_32);

    return 0;
}

int SimulatorBlockDevice::erase(bd_addr_t addr, bd_size_t size)
{
    MBED_ASSERT(is_valid_erase(addr, size));
    // TODO assert on programming unerased blocks

    size_t addr_32 = static_cast<uint32_t>(addr);
    size_t size_32 = static_cast<uint32_t>(size);

    EM_ASM_({
        window.MbedJSHal.blockdevice.erase(Pointer_stringify($0), $1, $2);
    }, _key_name, addr_32, size_32);

    return 0;
}
