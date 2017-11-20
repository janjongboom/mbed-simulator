/**
 *  Minimal configuration for using mbedtls as part of mbed-client
 *
 *  NOTE! This is an optimized, minimal configuration for mbed Client.
 *  We know it works with mbed Client but if you want to add more
 *  services/communications to the application yourself - please ensure
 *  you update this configuration accordingly. The default configuration
 *  can be found from mbedTLS Github:
 *
 *  https://github.com/ARMmbed/mbedtls/blob/development/include/mbedtls/config.h
 *
 *
 *  Copyright (C) 2006-2016, ARM Limited, All Rights Reserved
 *  SPDX-License-Identifier: Apache-2.0
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"); you may
 *  not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 *  WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 *  This file is part of mbed TLS (https://tls.mbed.org)
 */


#ifndef MBEDTLS_CUSTOM_CONFIG_H
#define MBEDTLS_CUSTOM_CONFIG_H

/* Enable entropy for K64F and K22F. This means entropy is disabled for all other targets. */
/* Do **NOT** deploy this code in production on other targets! */
/* See https://tls.mbed.org/kb/how-to/add-entropy-sources-to-entropy-pool */
#if defined(TARGET_K64F) || defined(TARGET_K22F)
#undef MBEDTLS_NO_DEFAULT_ENTROPY_SOURCES
#undef MBEDTLS_TEST_NULL_ENTROPY
#endif

/* System support */
#define MBEDTLS_HAVE_ASM

/* mbed TLS feature support */
#define MBEDTLS_ECP_DP_SECP256R1_ENABLED
#define MBEDTLS_ECP_NIST_OPTIM
#define MBEDTLS_SSL_MAX_FRAGMENT_LENGTH
#define MBEDTLS_SSL_PROTO_TLS1_2
#define MBEDTLS_SSL_PROTO_DTLS
#define MBEDTLS_SSL_DTLS_ANTI_REPLAY
#define MBEDTLS_SSL_DTLS_HELLO_VERIFY
#define MBEDTLS_SSL_EXPORT_KEYS

/* mbed TLS modules */
#define MBEDTLS_AES_C
#define MBEDTLS_ASN1_PARSE_C
#define MBEDTLS_ASN1_WRITE_C
#define MBEDTLS_BIGNUM_C
#define MBEDTLS_CIPHER_C
#define MBEDTLS_CTR_DRBG_C
#define MBEDTLS_ECP_C
#define MBEDTLS_ENTROPY_C
#define MBEDTLS_MD_C
#define MBEDTLS_OID_C
#define MBEDTLS_PK_C
#define MBEDTLS_PK_PARSE_C
#define MBEDTLS_SHA256_C
#define MBEDTLS_SSL_COOKIE_C
#define MBEDTLS_SSL_CLI_C
#define MBEDTLS_SSL_SRV_C
#define MBEDTLS_SSL_TLS_C

// XXX mbedclient needs these: mbedtls_x509_crt_free, mbedtls_x509_crt_init, mbedtls_x509_crt_parse
#define MBEDTLS_X509_USE_C
#define MBEDTLS_X509_CRT_PARSE_C

// XXX: clean these up!!
#define MBEDTLS_SHA512_C
#define MBEDTLS_ECDH_C
#define MBEDTLS_GCM_C

#define MBEDTLS_ECDH_C
#define MBEDTLS_ECDSA_C
#define MBEDTLS_X509_CRT_PARSE_C

// Remove RSA, save 20KB at total
#undef MBEDTLS_RSA_C
#undef MBEDTLS_KEY_EXCHANGE_ECDHE_RSA_ENABLED

// Remove error messages, save 10KB of ROM
#undef MBEDTLS_ERROR_C

// Remove selftesting and save 11KB of ROM
#undef MBEDTLS_SELF_TEST

// Reduces ROM size by 30 kB
#undef MBEDTLS_ERROR_STRERROR_DUMMY
#undef MBEDTLS_VERSION_FEATURES
#undef MBEDTLS_DEBUG_C

// needed for parsing the certificates
#define MBEDTLS_PEM_PARSE_C
// dep of the previous
#define MBEDTLS_BASE64_C

// Reduce IO buffer to save RAM, default is 16KB
#define MBEDTLS_SSL_MAX_CONTENT_LEN 2048

// define to save 8KB RAM at the expense of ROM
#undef MBEDTLS_AES_ROM_TABLES

// Save ROM and a few bytes of RAM by specifying our own ciphersuite list
#define MBEDTLS_SSL_CIPHERSUITES MBEDTLS_TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,MBEDTLS_TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256

#include "mbedtls/check_config.h"

#endif /* MBEDTLS_CUSTOM_CONFIG_H */
