/**
 / _____)             _              | |
( (____  _____ ____ _| |_ _____  ____| |__
 \____ \| ___ |    (_   _) ___ |/ ___)  _ \
 _____) ) ____| | | || |_| ____( (___| | | |
(______/|_____)_|_|_| \__)_____)\____)_| |_|
    (C)2013 Semtech
 ___ _____ _   ___ _  _____ ___  ___  ___ ___
/ __|_   _/_\ / __| |/ / __/ _ \| _ \/ __| __|
\__ \ | |/ _ \ (__| ' <| _| (_) |   / (__| _|
|___/ |_/_/ \_\___|_|\_\_| \___/|_|_\\___|___|
embedded.connectivity.solutions===============

Description: LoRaWAN stack layer that controls both MAC and PHY underneath

License: Revised BSD License, see LICENSE.TXT file include in the project

Maintainer: Miguel Luis ( Semtech ), Gregory Cristian ( Semtech ) and Daniel Jaeckle ( STACKFORCE )

Copyright (c) 2017, Arm Limited and affiliates.

SPDX-License-Identifier: BSD-3-Clause
*/

#include <stdio.h>
#include <math.h> //rint
#include <string.h>
#include "mbed.h"
#include "SX1276_LoRaRadio.h"

#include "mbed_trace.h"
#define TRACE_GROUP "LRAD"

/*!
 * Sync word for Private LoRa networks
 */
#define LORA_MAC_PRIVATE_SYNCWORD                   0x12

/*!
 * Sync word for Public LoRa networks
 */
#define LORA_MAC_PUBLIC_SYNCWORD                    0x34

/*!
 * SX1276 definitions
 */
#define XTAL_FREQ                                   32000000
#define FREQ_STEP                                   61.03515625

/*!
 * Constant values need to compute the RSSI value
 */
#define RSSI_OFFSET_LF                              -164.0
#define RSSI_OFFSET_HF                              -157.0
#define RF_MID_BAND_THRESH                          525000000


/*!
 * FSK bandwidth definition
 */
typedef struct
{
    uint32_t bandwidth;
    uint8_t  register_value;
} fsk_bw_t;

/*!
 * Radio registers definition
 */
typedef struct
{
    uint8_t     modem;
    uint8_t     addr;
    uint8_t     value;
} radio_registers_t;

#define RADIO_INIT_REGISTERS_VALUE                \
{                                                 \
    { MODEM_FSK , REG_LNA                , 0x23 },\
    { MODEM_FSK , REG_RXCONFIG           , 0x1E },\
    { MODEM_FSK , REG_RSSICONFIG         , 0xD2 },\
    { MODEM_FSK , REG_AFCFEI             , 0x01 },\
    { MODEM_FSK , REG_PREAMBLEDETECT     , 0xAA },\
    { MODEM_FSK , REG_OSC                , 0x07 },\
    { MODEM_FSK , REG_SYNCCONFIG         , 0x12 },\
    { MODEM_FSK , REG_SYNCVALUE1         , 0xC1 },\
    { MODEM_FSK , REG_SYNCVALUE2         , 0x94 },\
    { MODEM_FSK , REG_SYNCVALUE3         , 0xC1 },\
    { MODEM_FSK , REG_PACKETCONFIG1      , 0xD8 },\
    { MODEM_FSK , REG_FIFOTHRESH         , 0x8F },\
    { MODEM_FSK , REG_IMAGECAL           , 0x02 },\
    { MODEM_FSK , REG_DIOMAPPING1        , 0x00 },\
    { MODEM_FSK , REG_DIOMAPPING2        , 0x30 },\
    { MODEM_LORA, REG_LR_PAYLOADMAXLENGTH, 0x40 },\
}

static const fsk_bw_t fsk_bandwidths[] =
{
    { 2600  , 0x17 },
    { 3100  , 0x0F },
    { 3900  , 0x07 },
    { 5200  , 0x16 },
    { 6300  , 0x0E },
    { 7800  , 0x06 },
    { 10400 , 0x15 },
    { 12500 , 0x0D },
    { 15600 , 0x05 },
    { 20800 , 0x14 },
    { 25000 , 0x0C },
    { 31300 , 0x04 },
    { 41700 , 0x13 },
    { 50000 , 0x0B },
    { 62500 , 0x03 },
    { 83333 , 0x12 },
    { 100000, 0x0A },
    { 125000, 0x02 },
    { 166700, 0x11 },
    { 200000, 0x09 },
    { 250000, 0x01 },
    { 300000, 0x00 }, // Invalid bandwidth
};

/**
 * SPI read/write masks
 */
#define SPI_WRITE_CMD   0x80
#define SPI_READ_CMD    0x7F

/**
 * Signals
 */
#define SIG_DIO0    0x01
#define SIG_DIO1    0x02
#define SIG_DIO2    0x04
#define SIG_DIO3    0x08
#define SIG_DIO4    0x10
#define SIG_DIO5    0x20
#define SIG_TIMOUT  0x40

enum RadioVariant {
    SX1276UNDEFINED = 0,
    SX1276MB1LAS,
    SX1276MB1MAS
};

#ifdef MBED_SX1276_LORA_RADIO_SPI_FREQUENCY
#define SPI_FREQUENCY    MBED_SX1276_LORA_RADIO_SPI_FREQUENCY
#else
#define SPI_FREQUENCY    8000000
#endif

/**
 * Constructor
 */
SX1276_LoRaRadio::SX1276_LoRaRadio(PinName spi_mosi,
                                   PinName spi_miso,
                                   PinName spi_sclk,
                                   PinName nss,
                                   PinName reset,
                                   PinName dio0,
                                   PinName dio1,
                                   PinName dio2,
                                   PinName dio3,
                                   PinName dio4,
                                   PinName dio5,
                                   PinName rf_switch_ctl1,
                                   PinName rf_switch_ctl2,
                                   PinName txctl,
                                   PinName rxctl,
                                   PinName antswitch,
                                   PinName pwr_amp_ctl,
                                   PinName tcxo)
    :  _chip_select(nss, 1),
        _reset_ctl(reset),
        _dio0_ctl(dio0), _dio1_ctl(dio1), _dio2_ctl(dio2), _dio3_ctl(dio3), _dio4_ctl(dio4), _dio5_ctl(dio5),
        _rf_switch_ctl1(rf_switch_ctl1, 0), _rf_switch_ctl2(rf_switch_ctl2, 0),
        _txctl(txctl, 0), _rxctl(rxctl, 0),
        _ant_switch(antswitch, PIN_INPUT, PullUp, 0),
        _pwr_amp_ctl(pwr_amp_ctl),
        _tcxo(tcxo)

#ifdef MBED_CONF_RTOS_PRESENT
        , irq_thread(osPriorityRealtime, 1024)
#endif
{
    _rf_ctrls.ant_switch = antswitch;
    _rf_ctrls.pwr_amp_ctl = pwr_amp_ctl;
    _rf_ctrls.rf_switch_ctl1 = rf_switch_ctl1;
    _rf_ctrls.rf_switch_ctl2 = rf_switch_ctl2;
    _rf_ctrls.rxctl = rxctl;
    _rf_ctrls.txctl = txctl;
    _rf_ctrls.tcxo = tcxo;

    _dio4_pin = dio4;
    _dio5_pin = dio5;

    _radio_events = NULL;

    if (tcxo != NC) {
        _tcxo = 1;
    }

    EM_ASM_({
        window.MbedJSHal.lora.init($0);
    }, this);
}

/**
 * Destructor
 */
SX1276_LoRaRadio::~SX1276_LoRaRadio()
{

}

/*****************************************************************************
 * Public APIs                                                               *
 ****************************************************************************/
/**
 * Acquire lock
 */
void SX1276_LoRaRadio::lock(void)
{
    mutex.lock();
}

/**
 * Release lock
 */
void SX1276_LoRaRadio::unlock(void)
{
    mutex.unlock();
}

/**
 * Initializes radio module
 */
void SX1276_LoRaRadio::init_radio(radio_events_t *events)
{
    _radio_events = events;

    // Reset the radio transceiver
    radio_reset();

    // set modem type - defaults to FSK here
    set_modem(MODEM_FSK);

    // set state to be idle
    _rf_settings.state = RF_IDLE;
}

/**
 * Can be used by application/stack or the driver itself
 */
void SX1276_LoRaRadio::radio_reset()
{
    // tr_debug("radio_reset");
}

/**
 * TODO: The purpose of this API is unclear.
 *       Need to start an internal discussion.
 */
bool SX1276_LoRaRadio::check_rf_frequency(uint32_t frequency)
{
    // Implement check. Currently all frequencies are supported ? What band ?
    return true;
}

/**
 * Returns current status of the radio state machine
 */
uint8_t SX1276_LoRaRadio::get_status(void)
{
    return _rf_settings.state;
}

/**
 * Sets up carrier frequency
 */
void SX1276_LoRaRadio::set_channel(uint32_t freq)
{
    // tr_debug("set_channel (freq=%u)", freq);
    _rf_settings.channel = freq;
    freq = (uint32_t) ((double) freq / (double) FREQ_STEP);
}

/**
 * Generates 32 bit random number based upon RSSI monitoring
 * Used for various calculation by the stack for example dev nonce
 *
 * When this API is used modem is set in LoRa mode and all interrupts are
 * masked. If the user had been using FSK mode, it should be noted that a
 * change of mode is required again because the registers have changed.
 * In addition to that RX and TX configuration APIs should be called again in
 * order to have correct desires setup.
 */
uint32_t SX1276_LoRaRadio::random( void )
{
    uint32_t rnd = EM_ASM_INT({
        return Math.random() * 0x8000000 | 0;
    });

    sleep();

    return rnd;
}

/**
 * Sets up receiver related configurations
 *
 * Must be called before setting the radio in rx mode
 */
void SX1276_LoRaRadio::set_rx_config(radio_modems_t modem, uint32_t bandwidth,
                                     uint32_t datarate, uint8_t coderate,
                                     uint32_t bandwidth_afc,
                                     uint16_t preamble_len,
                                     uint16_t symb_timeout, bool fix_len,
                                     uint8_t payload_len, bool crc_on,
                                     bool freq_hop_on, uint8_t hop_period,
                                     bool iq_inverted, bool rx_continuous)
{
    // tr_debug("set_rx_config rx_continuous=%d, dr=%u, bw=%u", rx_continuous, datarate, bandwidth);

    set_modem(modem);

    switch (modem) {
        case MODEM_FSK:
            _rf_settings.fsk.bandwidth = bandwidth;
            _rf_settings.fsk.datarate = datarate;
            _rf_settings.fsk.bandwidth_afc = bandwidth_afc;
            _rf_settings.fsk.fix_len = fix_len;
            _rf_settings.fsk.payload_len = payload_len;
            _rf_settings.fsk.crc_on = crc_on;
            _rf_settings.fsk.iq_inverted = iq_inverted;
            _rf_settings.fsk.rx_continuous = rx_continuous;
            _rf_settings.fsk.preamble_len = preamble_len;
            _rf_settings.fsk.rx_single_timeout = symb_timeout
                    * ((1.0 / (double) datarate) * 8.0) * 1e3;

            datarate = (uint16_t) ((double) XTAL_FREQ / (double) datarate);

            // tr_debug("set_rx_config FSK");

            break;

        case MODEM_LORA:

            if (bandwidth > 2) {
                // Fatal error: When using LoRa modem only bandwidths 125, 250 and 500 kHz are supported
                while (1)
                    ;
                // TODO Return a proper error from here
            }

            // stupid hack. TODO think something better
            bandwidth+=7;

            // timeout should be

            _rf_settings.lora.bandwidth = bandwidth;
            _rf_settings.lora.datarate = datarate;
            _rf_settings.lora.coderate = coderate;
            _rf_settings.lora.preamble_len = preamble_len;
            _rf_settings.lora.fix_len = fix_len;
            _rf_settings.lora.payload_len = payload_len;
            _rf_settings.lora.crc_on = crc_on;
            _rf_settings.lora.freq_hop_on = freq_hop_on;
            _rf_settings.lora.hop_period = hop_period;
            _rf_settings.lora.iq_inverted = iq_inverted;
            _rf_settings.lora.rx_continuous = rx_continuous;
            _rf_settings.lora.symb_timeout = symb_timeout;

            if (datarate > 12) {
                datarate = 12;
            } else if (datarate < 6) {
                datarate = 6;
            }

            if (((bandwidth == 7) && ((datarate == 11) || (datarate == 12)))
                    || ((bandwidth == 8) && (datarate == 12))) {
                _rf_settings.lora.low_datarate_optimize = 0x01;
            } else {
                _rf_settings.lora.low_datarate_optimize = 0x00;
            }

            // tr_debug("set_rx_config LORA");
            break;

        default:
            break;
    }
}

/**
 * Sets up transmitter related configuration
 *
 * Must be called before putting the radio module in Tx mode or trying
 * to send
 */
void SX1276_LoRaRadio::set_tx_config(radio_modems_t modem, int8_t power,
                                     uint32_t fdev, uint32_t bandwidth,
                                     uint32_t datarate, uint8_t coderate,
                                     uint16_t preamble_len, bool fix_len,
                                     bool crc_on, bool freq_hop_on,
                                     uint8_t hop_period, bool iq_inverted,
                                     uint32_t timeout)
{
    set_modem(modem);
    set_rf_tx_power(power);

    switch (modem) {
        case MODEM_FSK:
            _rf_settings.fsk.power = power;
            _rf_settings.fsk.f_dev = fdev;
            _rf_settings.fsk.bandwidth = bandwidth;
            _rf_settings.fsk.datarate = datarate;
            _rf_settings.fsk.preamble_len = preamble_len;
            _rf_settings.fsk.fix_len = fix_len;
            _rf_settings.fsk.crc_on = crc_on;
            _rf_settings.fsk.iq_inverted = iq_inverted;
            _rf_settings.fsk.tx_timeout = timeout;

            fdev = (uint16_t) ((double) fdev / (double) FREQ_STEP);

            // tr_debug("set_tx_config FSK");

            break;

        case MODEM_LORA:
            _rf_settings.lora.power = power;
            if (bandwidth > 2) {
                // Fatal error: When using LoRa modem only bandwidths 125, 250 and 500 kHz are supported
                while (1)
                    ;
            }
            bandwidth += 7;
            _rf_settings.lora.bandwidth = bandwidth;
            _rf_settings.lora.datarate = datarate;
            _rf_settings.lora.coderate = coderate;
            _rf_settings.lora.preamble_len = preamble_len;
            _rf_settings.lora.fix_len = fix_len;
            _rf_settings.lora.freq_hop_on = freq_hop_on;
            _rf_settings.lora.hop_period = hop_period;
            _rf_settings.lora.crc_on = crc_on;
            _rf_settings.lora.iq_inverted = iq_inverted;
            _rf_settings.lora.tx_timeout = timeout;

            if (datarate > 12) {
                datarate = 12;
            } else if (datarate < 6) {
                datarate = 6;
            }
            if (((bandwidth == 7) && ((datarate == 11) || (datarate == 12)))
                    || ((bandwidth == 8) && (datarate == 12))) {
                _rf_settings.lora.low_datarate_optimize = 0x01;
            } else {
                _rf_settings.lora.low_datarate_optimize = 0x00;
            }

            // tr_debug("set_rx_config LORA");

            break;
    }
}

/**
 * Calculates time on Air i.e., dwell time for a single packet
 *
 * Crucial for the stack in order to calculate dwell time so as to control
 * duty cycling.
 */
uint32_t SX1276_LoRaRadio::time_on_air(radio_modems_t modem, uint8_t pkt_len)
{
    uint32_t airTime = 0;

    // tr_debug("time_on_air");

    switch (modem) {
        case MODEM_FSK:
            airTime = 1;

            break;
        case MODEM_LORA:
            double bw = 0.0;
            // REMARK: When using LoRa modem only bandwidths 125, 250 and 500 kHz are supported
            switch (_rf_settings.lora.bandwidth) {
                //case 0: // 7.8 kHz
                //    bw = 78e2;
                //    break;
                //case 1: // 10.4 kHz
                //    bw = 104e2;
                //    break;
                //case 2: // 15.6 kHz
                //    bw = 156e2;
                //    break;
                //case 3: // 20.8 kHz
                //    bw = 208e2;
                //    break;
                //case 4: // 31.2 kHz
                //    bw = 312e2;
                //    break;
                //case 5: // 41.4 kHz
                //    bw = 414e2;
                //    break;
                //case 6: // 62.5 kHz
                //    bw = 625e2;
                //    break;
                case 7: // 125 kHz
                    bw = 125e3;
                    break;
                case 8: // 250 kHz
                    bw = 250e3;
                    break;
                case 9: // 500 kHz
                    bw = 500e3;
                    break;
            }

            // Symbol rate : time for one symbol (secs)
            double rs = bw / (1 << _rf_settings.lora.datarate);
            double ts = 1 / rs;
            // time of preamble
            double tPreamble = (_rf_settings.lora.preamble_len + 4.25) * ts;
            // Symbol length of payload and time
            double tmp = ceil((8 * pkt_len - 4 * _rf_settings.lora.datarate + 28
                            + 16 * _rf_settings.lora.crc_on
                            - (_rf_settings.lora.fix_len ? 20 : 0))
                            / (double) (4
                                    * (_rf_settings.lora.datarate
                                            - ((_rf_settings.lora.low_datarate_optimize > 0)
                                                    ? 2 : 0))))
                            * (_rf_settings.lora.coderate + 4);
            double nPayload = 8 + ((tmp > 0) ? tmp : 0);
            double tPayload = nPayload * ts;
            // Time on air
            double tOnAir = tPreamble + tPayload;
            // return ms secs
            airTime = floor(tOnAir * 1e3 + 0.999);

            break;
    }

    return airTime;
}

/**
 * Prepares and sends the radio packet out in the air
 */
void SX1276_LoRaRadio::send(uint8_t *buffer, uint8_t size)
{
    uint32_t tx_timeout = 0;

    switch (_rf_settings.modem) {
        case MODEM_FSK:
            EM_ASM_({
                window.MbedJSHal.lora.sendFsk($0, $1, $2, $3, $4, $5);
            }, _rf_settings.channel, _rf_settings.fsk.power, _rf_settings.fsk.bandwidth, _rf_settings.fsk.datarate, buffer, size);
        break;

        case MODEM_LORA:
            EM_ASM_({
                window.MbedJSHal.lora.sendLoRa($0, $1, $2, $3, $4, $5);
            }, _rf_settings.channel, _rf_settings.lora.power, _rf_settings.lora.bandwidth, _rf_settings.lora.datarate, buffer, size);
        break;
    }

    transmit(tx_timeout);
}

/**
 * sets the radio module to sleep
 */

void SX1276_LoRaRadio::sleep()
{
    // tr_debug("sleep");

    // stop timers
    tx_timeout_timer.detach();
    rx_timeout_timer.detach();
}

/**
 * Put radio in Standby mode
 */
void SX1276_LoRaRadio::standby( void )
{
    // tr_debug("standby");

    tx_timeout_timer.detach();
    rx_timeout_timer.detach();

    _rf_settings.state = RF_IDLE;
}

void SX1276_LoRaRadio::rx_frame(uint8_t* data, uint32_t size, uint32_t frequency, uint8_t bandwidth, uint8_t datarate) {
    tr_debug("rx_frame, size=%u, freq=%u, bw=%u, dr=%u", size, frequency, bandwidth, datarate);

    // EM_ASM_({ console.log(Date.now(), 'rx_frame, expected: bw=', $0, 'dr=', $1, 'channel=', $2, '- was', $3, $4, $5 )},
    //     _rf_settings.lora.bandwidth, _rf_settings.lora.datarate, _rf_settings.channel,
    //     bandwidth, datarate, frequency);

    if (_rf_settings.lora.bandwidth != bandwidth) {
        tr_debug("rx_frame bw not correct (expecting %d, was %d)", _rf_settings.lora.bandwidth, bandwidth);
        return;
    }

    if (_rf_settings.lora.datarate != datarate) {
        tr_debug("rx_frame dr not correct (expecting %d, was %d)", _rf_settings.lora.datarate, datarate);
        return;
    }

    if (_rf_settings.channel != frequency) {
        tr_debug("rx_frame freq not correct (expecting %d, was %d)", _rf_settings.channel, frequency);
        return;
    }

    memcpy(_data_buffer, data, size);
    _rf_settings.lora_packet_handler.size = size;
    _rf_settings.lora_packet_handler.rssi_value = -35;
    _rf_settings.lora_packet_handler.snr_value = -5;
    _rf_settings.lora_packet_handler.pending = true;
    _rf_settings.lora_packet_handler.timestamp_ms = EM_ASM_INT({ return Date.now(); });

    if (_rf_settings.state == RF_RX_RUNNING) {
        // EM_ASM({ console.log('rf state is RF_RX_RUNNING, gonna call the rx_done_irq') });
        _rf_settings.lora_packet_handler.pending = false;
        rx_done_irq();
    }
}

/**
 * Sets the radio module in receive mode
 *
 * A DIO4 interrupt let's the state machine know that a preamble is detected
 * and finally a DIO0 interrupt let's the state machine know that a packet is
 * ready to be read from the FIFO
 */
void SX1276_LoRaRadio::receive()
{
    // tr_debug("receive (timeout=%u). has_pending=%d, bw=%u, dr=%u, channel=%u", _rf_settings.lora.symb_timeout, _rf_settings.lora_packet_handler.pending,
    //     _rf_settings.lora.datarate, _rf_settings.lora.bandwidth, _rf_settings.channel);
    // EM_ASM_({ console.log(Date.now(), 'retrieve dr=', $0)}, _rf_settings.lora.datarate);

    _rf_settings.state = RF_RX_RUNNING;

    // q:
    if (_rf_settings.lora_packet_handler.pending) {
        uint32_t delta_ms = EM_ASM_INT({ return Date.now(); }) - _rf_settings.lora_packet_handler.timestamp_ms;

        // tr_debug("receive delta %u ms.", delta_ms);

        _rf_settings.lora_packet_handler.pending = false;

        // if (delta_ms > 1000) {
        //     tr_warn("receive delta was over 1000 ms (was %u ms), discarding packet", delta_ms);
        //     return;
        // }

        rx_done_irq();
        return;
    }

    if (_rf_settings.lora.symb_timeout != 0) {
        rx_timeout_timer.attach_us(
                callback(this, &SX1276_LoRaRadio::timeout_irq_isr),
                _rf_settings.lora.symb_timeout * 1e3);
    }
}


/**
 * Perform carrier sensing
 *
 * Checks for a certain time if the RSSI is above a given threshold.
 * This threshold determines if there is already a transmission going on
 * in the channel or not.
 *
 */
bool SX1276_LoRaRadio::perform_carrier_sense(radio_modems_t modem,
                                   uint32_t freq,
                                   int16_t rssi_threshold,
                                   uint32_t max_carrier_sense_time)
{
    // tr_debug("perform_carrier_sense");

    bool status = true;
    int16_t rssi = 0;

    set_modem(modem);
    set_channel(freq);

    // hold on a bit, radio turn-around time
    wait_ms(1);

    Timer elapsed_time;
    elapsed_time.start();

    // Perform carrier sense for maxCarrierSenseTime
    while (elapsed_time.read_ms() < (int)max_carrier_sense_time) {
        rssi = get_rssi(modem);

        if (rssi > rssi_threshold) {
            status = false;
            break;
        }
    }

    sleep();
    return status;
}

/**
 * TODO: Making sure if this API is valid only for LoRa modulation ?
 *
 * Indicates if the node is part of a private or public network
 */
void SX1276_LoRaRadio::set_public_network(bool enable)
{
    set_modem(MODEM_LORA);

    _rf_settings.lora.public_network = enable;

    // tr_debug("set_public_network %d", enable);

}

/**
 * Puts a limit on the size of payload the module can handle
 * By default it is MAX, i.e., 256 bytes
 */
void SX1276_LoRaRadio::set_max_payload_length(radio_modems_t modem, uint8_t max)
{
    set_modem(modem);

    // tr_debug("set_max_payload_length (modem=%d, max=%u)", modem, max);
}

/**
 * Channel Activity detection (can be done only in LoRa mode)
 *
 * If any activity on the channel is detected, an interrupt is asserted on
 * DIO3. A callback will be generated to the stack/application upon the
 * assertion of DIO3.
 */
void SX1276_LoRaRadio::start_cad()
{
    // tr_debug("start_cad");
}

/**
 * Set transmission in continuous wave mode
 */
void SX1276_LoRaRadio::set_tx_continuous_wave(uint32_t freq, int8_t power,
                                              uint16_t time)
{
    // tr_debug("set_tx_continious_wave (freq=%u, power=%u, time=%u)", freq, power, time);

    set_channel(freq);
    set_tx_config(MODEM_FSK, power, 0, 0, 4800, 0, 5, false, false, 0, 0, 0, time);
    // reg_val = read_register(REG_PACKETCONFIG2);

    // write_to_register( REG_PACKETCONFIG2, (reg_val & RF_PACKETCONFIG2_DATAMODE_MASK ) );
    // // Disable radio interrupts
    // write_to_register( REG_DIOMAPPING1, RF_DIOMAPPING1_DIO0_11 | RF_DIOMAPPING1_DIO1_11 );
    // write_to_register( REG_DIOMAPPING2, RF_DIOMAPPING2_DIO4_10 | RF_DIOMAPPING2_DIO5_10 );

    _rf_settings.state = RF_TX_RUNNING;
    // tx_timeout_timer.attach_us(callback(this, &SX1276_LoRaRadio::timeout_irq_isr), time*1e3);
}


/**
 * Writes to FIIO provided by the chip
 */
void SX1276_LoRaRadio::write_fifo(uint8_t *buffer, uint8_t size)
{
    // tr_debug("write_fifo (size=%u)", size);
}

/**
 * Reads from the FIFO provided by the chip
 */
void SX1276_LoRaRadio::read_fifo(uint8_t *buffer, uint8_t size)
{
    // tr_debug("read_fifo (size=%u)", size);
}

/**
 * Sets up operation mode
 */
void SX1276_LoRaRadio::set_operation_mode(uint8_t mode)
{
    // tr_debug("set_operation_mode (mode=%u)", mode);

    set_low_power_mode();
    set_antenna_switch(mode);
}

/**
 * Sets the modem type to use
 *
 * At initialization FSK is chosen. Later stack or application
 * can choose to change.
 */
void SX1276_LoRaRadio::set_modem(uint8_t modem )
{
    _rf_settings.modem = modem;

    // tr_debug("set_modem %d", _rf_settings.modem);
}

/**
 * Set the radio module variant
 */
void SX1276_LoRaRadio::set_sx1276_variant_type()
{
    if (_rf_ctrls.ant_switch != NC) {
        _ant_switch.input();
        wait_ms(1);
        if (_ant_switch == 1) {
            radio_variant = SX1276MB1LAS;
        } else {
            radio_variant = SX1276MB1MAS;
        }
        _ant_switch.output();
        wait_ms(1);
    } else {
        radio_variant = SX1276UNDEFINED;
    }
}

/**
 * Sets the radio registers to defaults
 */
void SX1276_LoRaRadio::setup_registers()
{
    // tr_debug("setup_registers");
}

/**
 * Performs the Rx chain calibration for LF and HF bands
 *
 * Must be called just after the reset so all registers are at their
 * default values.
 */
void SX1276_LoRaRadio::rx_chain_calibration(void)
{
    // tr_debug("rx_chain_calibration");
}

/**
 * Gets FSK bandwidth values
 *
 * Gives either normal bandwidths or bandwidths for
 * AFC (auto frequency correction)
 */
uint8_t SX1276_LoRaRadio::get_fsk_bw_reg_val(uint32_t bandwidth)
{
    uint8_t i;

    for (i = 0; i < (sizeof(fsk_bandwidths) / sizeof(fsk_bw_t)) - 1; i++) {
        if ((bandwidth >= fsk_bandwidths[i].bandwidth)
                && (bandwidth < fsk_bandwidths[i + 1].bandwidth)) {
            return fsk_bandwidths[i].register_value;
        }
    }
    // ERROR: Value not found
    // This should never happen
    while (1);
}

uint8_t SX1276_LoRaRadio::get_pa_conf_reg(uint32_t channel)
{
    return 0x0;
}

/**
 * Sets the transmit power for the module
 */
void SX1276_LoRaRadio::set_rf_tx_power(int8_t power)
{
    // tr_debug("set_rf_tx_power (power=%u)", power);
}

/**
 * Actual TX - Transmit routine
 *
 * A DIO0 interrupt let the state machine know that a a packet is
 * successfully sent, otherwise a TxTimeout is invoked.
 * TxTimeout should never happen in normal circumstances as the radio should
 * be able to send a packet out in the air no matter what.
 */
void SX1276_LoRaRadio::transmit(uint32_t timeout)
{
    tr_debug("transmit channel=%u power=%u bandwidth=%u datarate=%u", _rf_settings.channel, _rf_settings.lora.power, _rf_settings.lora.bandwidth, _rf_settings.lora.datarate);

    _rf_settings.state = RF_TX_RUNNING;
    // tx_timeout_timer.attach_us(callback(this,
    //                            &SX1276_LoRaRadio::timeout_irq_isr), timeout*1e3);

    // trigger interrupt here?
    tx_done_timer.attach_us(callback(this, &SX1276_LoRaRadio::tx_done_irq),
        (time_on_air(MODEM_LORA, _rf_settings.lora_packet_handler.size) * 1000) + (3 * 1000));
}

void SX1276_LoRaRadio::tx_done_irq() {
    tx_done_timer.detach();

    _rf_settings.state = RF_IDLE;

    // tr_info("tx_done_irq");

    if ((_radio_events != NULL)
        && (_radio_events->tx_done)) {

        _radio_events->tx_done();
    }
}

void SX1276_LoRaRadio::rx_done_irq() {
    // tr_debug("rx_done_irq");
    // EM_ASM({ console.log(Date.now(), 'rx_done_irq'); });

    rx_timeout_timer.detach();

    if (!_rf_settings.lora.rx_continuous) {
        _rf_settings.state = RF_IDLE;
    }

    if ((_radio_events != NULL)
        && (_radio_events->rx_done)) {

        _radio_events->rx_done(_data_buffer,
                _rf_settings.lora_packet_handler.size,
                _rf_settings.lora_packet_handler.rssi_value,
                _rf_settings.lora_packet_handler.snr_value);
    }
}

/**
 * Get RSSI from the module
 */
int16_t SX1276_LoRaRadio::get_rssi(radio_modems_t modem)
{
    // tr_debug("get_rssi");

    return -1;
}

/**
 * Sets the module in low power mode by disconnecting
 * TX and RX submodules, turning off power amplifier etc.
 */
void SX1276_LoRaRadio::set_low_power_mode()
{

    // tr_debug("set_low_power_mode");

    if (_rf_ctrls.rf_switch_ctl1 != NC) {
        _rf_switch_ctl1 = 0;
    }

    if (_rf_ctrls.rf_switch_ctl2 != NC) {
        _rf_switch_ctl2 = 0;
    }

    if (_rf_ctrls.pwr_amp_ctl != NC) {
        _pwr_amp_ctl = 0;
    }

    if (_rf_ctrls.txctl != NC) {
        _txctl = 0;
    }

    if (_rf_ctrls.txctl != NC) {
        _rxctl = 0;
    }

    if (_rf_ctrls.ant_switch != NC) {
        _ant_switch = 0;
    }
}

/**
 * Attaches ISRs to interrupt pins
 */
void SX1276_LoRaRadio::setup_interrupts()
{
}

/**
 * Sets up radio latch position according to the
 * radio mode
 */
void SX1276_LoRaRadio::set_antenna_switch(uint8_t mode)
{
}

// This is not a hardware interrupt
// we invoke it ourselves based upon
// our timers
void SX1276_LoRaRadio::timeout_irq_isr()
{
    rx_timeout_timer.detach();

#ifdef MBED_CONF_RTOS_PRESENT
    irq_thread.signal_set(SIG_TIMOUT);
#else
    handle_timeout_irq();
#endif
}

void SX1276_LoRaRadio::handle_timeout_irq()
{
    // tr_debug("handle_timeout_irq continious=%d", _rf_settings.lora.rx_continuous);

    switch (_rf_settings.state) {
        case RF_RX_RUNNING:
            if (_rf_settings.modem == MODEM_FSK) {
                _rf_settings.fsk_packet_handler.preamble_detected = 0;
                _rf_settings.fsk_packet_handler.sync_word_detected = 0;
                _rf_settings.fsk_packet_handler.nb_bytes = 0;
                _rf_settings.fsk_packet_handler.size = 0;

                // Clear Irqs
                // write_to_register(REG_IRQFLAGS1, RF_IRQFLAGS1_RSSI |
                // RF_IRQFLAGS1_PREAMBLEDETECT |
                // RF_IRQFLAGS1_SYNCADDRESSMATCH);
                // write_to_register( REG_IRQFLAGS2, RF_IRQFLAGS2_FIFOOVERRUN);

                if (_rf_settings.fsk.rx_continuous == true) {
                    // Continuous mode restart Rx chain
                    // write_to_register( REG_RXCONFIG,
                    //                   read_register(REG_RXCONFIG) |
                    //                   RF_RXCONFIG_RESTARTRXWITHOUTPLLLOCK);
                } else {
                    _rf_settings.state = RF_IDLE;
                    rx_timeout_sync_word.attach_us(
                            callback(this, &SX1276_LoRaRadio::timeout_irq_isr),
                            _rf_settings.fsk.rx_single_timeout * 1e3);
                }
            }


            if (_rf_settings.lora.rx_continuous == false) {
                _rf_settings.state = RF_IDLE;
            }

            if ((_radio_events != NULL)
                    && (_radio_events->rx_timeout)) {
                _radio_events->rx_timeout();
            }

            break;

        case RF_TX_RUNNING:
            // Tx timeout shouldn't happen.
            // But it has been observed that when it happens it is a result of a
            // corrupted SPI transfer
            // The workaround is to put the radio in a known state.
            // Thus, we re-initialize it.

            // // Reset the radio
            // radio_reset();

            // // Initialize radio default values
            // set_operation_mode(RF_OPMODE_SLEEP);

            // // setup_registers();

            // set_modem(MODEM_FSK);

            // // Restore previous network type setting.
            // set_public_network(_rf_settings.lora.public_network);

            // _rf_settings.state = RF_IDLE;
            // if ((_radio_events != NULL)
            //         && (_radio_events->tx_timeout)) {
            //     _radio_events->tx_timeout();
            // }
            break;
        default:
            break;
    }
}


EMSCRIPTEN_KEEPALIVE
extern "C" void handle_lora_downlink(uint32_t radioPtr, uint32_t dataPtr, uint32_t size, uint32_t freq, uint8_t bandwidth, uint8_t datarate) {
    // EM_ASM({ console.log('handle_lora_downlink cpp')});
    ((SX1276_LoRaRadio*)radioPtr)->rx_frame((uint8_t*)dataPtr, size, freq, bandwidth, datarate);
}

// EOF

