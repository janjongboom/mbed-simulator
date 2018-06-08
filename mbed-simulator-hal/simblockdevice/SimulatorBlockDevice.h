#ifndef _SIMULATOR_BLOCK_DEVICE_H_
#define _SIMULATOR_BLOCK_DEVICE_H_

#include "mbed.h"
#include "BlockDevice.h"

/** Block device which stores its data in browser's local storage
 *
 * Useful for simulating a block device and tests
 *
 * @code
 * #include "mbed.h"
 * #include "SimulatorBlockDevice.h"
 *
 * #define BLOCK_SIZE 512
 *
 * SimulatorBlockDevice bd(2048, BLOCK_SIZE); // 2048 bytes with a block size of 512 bytes
 * uint8_t block[BLOCK_SIZE] = "Hello World!\n";
 *
 * int main() {
 *     bd.init();
 *     bd.erase(0, BLOCK_SIZE);
 *     bd.program(block, 0, BLOCK_SIZE);
 *     bd.read(block, 0, BLOCK_SIZE);
 *     printf("%s", block);
 *     bd.deinit();
 * }
 * @endcode
 */
class SimulatorBlockDevice : public BlockDevice
{
public:

    /** Lifetime of the simulator block device
     *
     * @param keyName   Name of the Block Device in local storage
     * @param size      Size of the Block Device in bytes
     * @param block     Block size in bytes. Minimum read, program, and erase sizes are
     *                  configured to this value
     */
    SimulatorBlockDevice(const char *keyName, bd_size_t size, bd_size_t block=512);
    /** Lifetime of the simulator block device
     *
     * @param keyName   Name of the Block Device in local storage
     * @param size      Size of the Block Device in bytes
     * @param read      Minimum read size required in bytes
     * @param program   Minimum program size required in bytes
     * @param erase     Minimum erase size required in bytes
     */
    SimulatorBlockDevice(const char *keyName, bd_size_t size, bd_size_t read, bd_size_t program, bd_size_t erase);
    virtual ~SimulatorBlockDevice();

    /** Initialize a block device
     *
     *  @return         0 on success or a negative error code on failure
     */
    virtual int init();

    /** Deinitialize a block device
     *
     *  @return         0 on success or a negative error code on failure
     */
    virtual int deinit();

    /** Read blocks from a block device
     *
     *  @param buffer   Buffer to read blocks into
     *  @param addr     Address of block to begin reading from
     *  @param size     Size to read in bytes, must be a multiple of read block size
     *  @return         0 on success, negative error code on failure
     */
    virtual int read(void *buffer, bd_addr_t addr, bd_size_t size);

    /** Program blocks to a block device
     *
     *  The blocks must have been erased prior to being programmed
     *
     *  @param buffer   Buffer of data to write to blocks
     *  @param addr     Address of block to begin writing to
     *  @param size     Size to write in bytes, must be a multiple of program block size
     *  @return         0 on success, negative error code on failure
     */
    virtual int program(const void *buffer, bd_addr_t addr, bd_size_t size);

    /** Erase blocks on a block device
     *
     *  The state of an erased block is undefined until it has been programmed
     *
     *  @param addr     Address of block to begin erasing
     *  @param size     Size to erase in bytes, must be a multiple of erase block size
     *  @return         0 on success, negative error code on failure
     */
    virtual int erase(bd_addr_t addr, bd_size_t size);

    /** Get the size of a readable block
     *
     *  @return         Size of a readable block in bytes
     */
    virtual bd_size_t get_read_size() const;

    /** Get the size of a programmable block
     *
     *  @return         Size of a programmable block in bytes
     */
    virtual bd_size_t get_program_size() const;

    /** Get the size of an erasable block
     *
     *  @return         Size of an erasable block in bytes
     */
    virtual bd_size_t get_erase_size() const;

    /** Get the size of an erasable block given address
     *
     *  @param addr     Address within the erasable block
     *  @return         Size of an erasable block in bytes
     *  @note Must be a multiple of the program size
     */
    virtual bd_size_t get_erase_size(bd_addr_t addr) const;

    /** Get the total size of the underlying device
     *
     *  @return         Size of the underlying device in bytes
     */
    virtual bd_size_t size() const;

private:
    const char *_key_name;
    bd_size_t _read_size;
    bd_size_t _program_size;
    bd_size_t _erase_size;
    bd_size_t _count;
};

#endif // _SIMULATOR_BLOCK_DEVICE_H_
