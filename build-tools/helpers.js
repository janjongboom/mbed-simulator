const fs = require('fs');
const Path = require('path');

const isDirectory = source => fs.lstatSync(source).isDirectory();
const getDirectories = source => fs.readdirSync(source).map(name => Path.join(source, name)).filter(isDirectory).filter(d => Path.basename(d) !== '.git' && Path.basename(d) !== '.hg');
const getCFiles = source => {
    return fs.readdirSync(source)
        .map(name => Path.join(source, name))
        .filter(name => ['.c', '.cpp'].indexOf(Path.extname(name).toLowerCase()) > -1);
};
const getAllDirectories = source => {
    let dirs = [ Path.resolve(source) + Path.sep ];
    for (let d of getDirectories(source)) {
        dirs = dirs.concat(getAllDirectories(d));
    }
    return dirs;
};
const getAllCFiles = source => {
    let files = getCFiles(source);
    for (let d of getDirectories(source)) {
        files = files.concat(getAllCFiles(d));
    }
    return files;
};

const ignoreAndFilter = (list, ignoreFile) => {
    if (!fs.existsSync(ignoreFile)) {
        return list;
    }

    let parsed = fs.readFileSync(ignoreFile, 'utf8').split('\n').filter(f => !!f);

    parsed = parsed.map(l => new RegExp(l));

    list = list.filter(l => {
        return parsed.every(p => !p.test(l));
    });

    return list;
};

const defaultBuildFlags = [
    '-s', 'NO_EXIT_RUNTIME=1',
    '-s', 'ASSERTIONS=2',

    '-D__MBED__',
    '-DTARGET_SIMULATOR',
    '-DMBED_EXCLUSIVE_ACCESS=1U',
    '-DMBEDTLS_TEST_NULL_ENTROPY',
    '-DMBEDTLS_NO_DEFAULT_ENTROPY_SOURCES',
    '-DMBED_CONF_EVENTS_SHARED_EVENTSIZE=256',

    '-O2',

    '-Wall',
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
const mkdirpSync = function(targetDir, {isRelativeToScript = false} = {}) {
    const sep = path.sep;
    const initDir = path.isAbsolute(targetDir) ? sep : '';
    const baseDir = isRelativeToScript ? __dirname : '.';

    targetDir.split(sep).reduce((parentDir, childDir) => {
    const curDir = path.resolve(baseDir, parentDir, childDir);
    try {
        fs.mkdirSync(curDir);
        console.log(`Directory ${curDir} created!`);
    } catch (err) {
        if (err.code !== 'EEXIST') {
        throw err;
        }

        console.log(`Directory ${curDir} already exists!`);
    }

    return curDir;
    }, initDir);
}

const getMacrosFromMbedAppJson = function(filename) {
    let mbedapp = fs.existsSync(pathname) ? JSON.parse(fs.readFileSync(pathname, 'utf-8')) : {};

    let macros = [];

    let mbedapp_conf = mbedapp.config || {};
    for (let key of Object.keys(mbedapp_conf)) {
        let value = mbedapp_conf[key].value.toString();

        key = 'MBED_CONF_APP_' + key.toUpperCase().replace(/(-|\.)/g, '_');

        value = value.replace(/"/g, '\\"');

        macros.push(key + '=' + value);
    }

    macros = macros.concat(mbedapp.macros || []);

    // features_add is not handled correctly
    let target_over = Object.assign({}, (mbedapp.target_overrides || {})['*'], (mbedapp.target_overrides || {})['SIMULATOR']);
    for (let key of Object.keys(target_over)) {
        let value = target_over[key].toString();
        key = 'MBED_CONF_' + key.toUpperCase().replace(/(-|\.)/g, '_');

        value = value.replace(/"/g, '\\"');

        macros.push(key + '=' + value);
    }

    return macros;
};

module.exports = {
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
    getMacrosFromMbedAppJson: getMacrosFromMbedAppJson
};
