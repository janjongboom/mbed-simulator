const fs = require('fs');
const Path = require('path');
const promisify = require('es6-promisify').promisify;
const spawn = require('child_process').spawn;
const os = require('os');
const crypto = require('crypto');
const emccCmd = process.platform === 'win32' ? 'emcc.bat' : 'emcc';

const exists = function(path) {
    return new Promise((resolve, reject) => {
        fs.exists(path, function(v) {
            resolve(v);
        });
    });
};

const isDirectory = async function(source) {
    return (await promisify(fs.lstat)(source)).isDirectory();
};

const getDirectories = async function(source) {
    let children = await promisify(fs.readdir)(source);

    let res = [];

    for (let d of children) {
        d = Path.join(source, d);

        if (Path.basename(d) === '.git' || Path.basename(d) === '.hg') continue;
        if (!await isDirectory(d)) continue;

        res.push(d);
    }

    return res;
};

const getCFiles = async function(source) {
    return (await promisify(fs.readdir)(source))
        .map(name => Path.join(source, name))
        .filter(name => ['.c', '.cpp'].indexOf(Path.extname(name).toLowerCase()) > -1);
};

const getAllDirectories = async function(source) {
    let dirs = [ Path.resolve(source) + Path.sep ];
    for (let d of await getDirectories(source)) {
        dirs = dirs.concat(await getAllDirectories(d));
    }
    return dirs;
};

const getAllCFiles = async function(source) {
    let files = await getCFiles(source);
    for (let d of await getDirectories(source)) {
        files = files.concat(await getAllCFiles(d));
    }
    return files;
};

const ignoreAndFilter = async function(list, ignoreFile) {
    if (!await exists(ignoreFile)) {
        return list;
    }

    let parsed = (await promisify(fs.readFile)(ignoreFile, 'utf8')).split('\n').filter(f => !!f).map(f => f.trim());

    parsed = parsed.map(l => new RegExp(l));

    list = list.filter(l => {
        // different path sep (like Windows)? Make sure to swap the characters - as the regex is linux style paths
        if (Path.sep === '\\') {
            l = l.replace(/\\/g, '/');
        }

        return parsed.every(p => !p.test(l));
    });

    return list;
};

const defaultBuildFlags = [
    '-s', 'NO_EXIT_RUNTIME=1',
    '-s', 'ASSERTIONS=2',
    '-s', 'ERROR_ON_UNDEFINED_SYMBOLS=0',
    '-s', 'FORCE_FILESYSTEM=1',

    '-D__MBED__',
    '-DTARGET_SIMULATOR',
    '-DMBED_EXCLUSIVE_ACCESS=1U',
    '-DMBEDTLS_CONFIG_FILE=\"simulator_mbedtls_config.h\"',
    '-DMBED_CONF_PLATFORM_STDIO_CONVERT_NEWLINES=1',
    '-DMBED_CONF_MBED_TRACE_ENABLE=1',
    '-DTARGET_LIKE_MBED',
    '-DDEVICE_EMAC=1',
    '-DDEVICE_STDIO_MESSAGES=1',
    '-DMBED_CONF_TARGET_NETWORK_DEFAULT_INTERFACE_TYPE=ETHERNET',
    '-DMBED_CONF_EVENTS_PRESENT',
    '-DMBED_CONF_NSAPI_PRESENT',
    '-DMBED_BUILD_TIMESTAMP=' + (Date.now() / 1000 | 0),


    // Pelion device management
    '-DARM_UC_USE_PAL_BLOCKDEVICE=1',
    '-DPAL_FS_MOUNT_POINT_PRIMARY=\"/IDBFS/pal\"',
    '-DMBED_CONF_EVENTS_SHARED_DISPATCH_FROM_APPLICATION=1',
    '-DMBED_CONF_EVENTS_SHARED_STACKSIZE=4096',
    '-DMBED_CONF_EVENTS_SHARED_EVENTSIZE=1024',
    '-DMBED_CONF_NANOSTACK_HAL_EVENT_LOOP_USE_MBED_EVENTS=1',
    '-DMBED_CONF_NANOSTACK_HAL_EVENT_LOOP_DISPATCH_FROM_APPLICATION=1',
    '-DARM_UC_FEATURE_CRYPTO_MBEDTLS=1',
    '-DARM_UC_FEATURE_CRYPTO_PAL=0',
    '-DARM_UC_PROFILE_MBED_CLOUD_CLIENT=1',
    '-DARM_UC_FEATURE_PAL_FLASHIAP=1',
    '-DARM_UC_FEATURE_PAL_BLOCKDEVICE=1',
    '-DMBED_CONF_UPDATE_CLIENT_STORAGE_SIZE=0',
    '-DMBED_CLIENT_USER_CONFIG_FILE="mbed_cloud_client_user_config.h"',
    '-DMBED_CLOUD_CLIENT_USER_CONFIG_FILE="mbed_cloud_client_user_config.h"',
    '-DMBED_CONF_APP_DEVELOPER_MODE=1'

    // '-Wall',
];

const emterpretifyFlags = [
    '-s', 'EMTERPRETIFY=1',
    '-s', 'EMTERPRETIFY_ASYNC=1',
    '-g3'
];

const nonEmterpretifyFlags = [
    '-s', 'ASYNCIFY=1',
    '-g4'
];

// from https://stackoverflow.com/questions/31645738/how-to-create-full-path-with-nodes-fs-mkdirsync
const mkdirpSync = function(targetDir) {
    const sep = Path.sep;
    const initDir = Path.isAbsolute(targetDir) ? sep : '';
    const baseDir = '.';

    targetDir.split(sep).reduce((parentDir, childDir) => {
        const curDir = Path.resolve(baseDir, parentDir, childDir);
        if (!fs.existsSync(curDir)) {
            fs.mkdirSync(curDir);
        }
        return curDir;
    }, initDir);
}

const getMacrosFromMbedAppJson = async function(filename) {
    let mbedapp;

    if (await exists(filename)) {
        mbedapp = JSON.parse(await promisify(fs.readFile)(filename, 'utf-8'));
    }
    else {
        mbedapp = {};
    }

    let macros = [];

    let mbedapp_conf = mbedapp.config || {};
    for (let key of Object.keys(mbedapp_conf)) {
        let macroKey = mbedapp_conf[key].macro_name || 'MBED_CONF_APP_' + key.toUpperCase().replace(/(-|\.)/g, '_');

        if (!mbedapp_conf[key].value) {
            if (mbedapp_conf[key].required) {
                throw "Required parameter '" + key + "' doesn't have a value";
            }
            macros.push(macroKey);
            continue;
        }

        macros.push(macroKey + '=' + mbedapp_conf[key].value.toString());
    }

    macros = macros.concat(mbedapp.macros || []);

    // features_add is not handled correctly
    let target_over = Object.assign({}, (mbedapp.target_overrides || {})['*'], (mbedapp.target_overrides || {})['SIMULATOR']);
    for (let key of Object.keys(target_over)) {
        if (!target_over[key]) continue;
        if (typeof target_over[key] !== 'string' && typeof target_over[key] !== 'number' && typeof target_over[key] !== 'boolean') {
            console.warn('Skipping', key, 'in target_overrides section in mbed_app.json (don\'t know how to serialize type)', target_over[key], typeof target_over[key]);
            continue;
        }

        let macroKey = key;

        if (macroKey.indexOf('.') > -1) {
            macroKey = 'MBED_CONF_' + macroKey.toUpperCase().replace(/(-|\.)/g, '_');
        }
        else {
            macroKey = 'MBED_CONF_APP_' + macroKey.toUpperCase().replace(/(-|\.)/g, '_');
        }

        let alreadyInMacros = macros.filter(m => {
            return m === macroKey || m.indexOf(macroKey + '=') === 0;
        });

        for (let m of alreadyInMacros) {
            macros.splice(macros.indexOf(m), 1);
        }

        macros.push(macroKey + '=' + target_over[key].toString());
    }

    return macros;
};

const spawnEmcc = async function(args) {
    let tmpFolder = Path.join(os.tmpdir(), (await promisify(crypto.randomBytes.bind(crypto))(32)).toString('hex'));

    let clearUpOnFinally = true;

    async function clear() {
        // clear up temp folder
        for (let file of await promisify(fs.readdir.bind(fs))(tmpFolder)) {
            await promisify(fs.unlink.bind(fs))(Path.join(tmpFolder, file));
        }

        await promisify(fs.rmdir.bind(fs))(tmpFolder);
    }

    try {
        // create temp folder
        await promisify(fs.mkdir.bind(fs))(tmpFolder);

        args = args.map(a => {
            // need to double escape backslashes
            if (Path.sep === '\\') {
                a = a.replace(/\\/g, '\\\\');
            }
            a = a.replace(/"/g, '\\"');
            a = `"${a}"`;
            return a;
        }).join(' ');

        // write arguments to file
        let tmpFile = Path.join(tmpFolder, 'args.txt');
        await promisify(fs.writeFile.bind(fs))(tmpFile, args, 'utf-8');

        clearUpOnFinally = false;

        let cmd = spawn(emccCmd, [ '@' + tmpFile ]);
        cmd.on('close', clear);
        return cmd;
    }
    catch (ex) {
        throw ex;
    }
    finally {
        if (clearUpOnFinally) {
            // clear up temp folder
            await clear();
        }
    }
}

module.exports = {
    exists: exists,
    isDirectory: isDirectory,
    getDirectories: getDirectories,
    getCFiles: getCFiles,
    getAllDirectories: getAllDirectories,
    getAllCFiles: getAllCFiles,
    ignoreAndFilter: ignoreAndFilter,
    defaultBuildFlags: defaultBuildFlags,
    emterpretifyFlags: emterpretifyFlags,
    nonEmterpretifyFlags: nonEmterpretifyFlags,
    mkdirpSync: mkdirpSync,
    getMacrosFromMbedAppJson: getMacrosFromMbedAppJson,
    emccCmd: emccCmd,
    spawnEmcc: spawnEmcc
};
