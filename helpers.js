const fs = require('fs');
const Path = require('path');
const ignore = require('ignore');

const isDirectory = source => fs.lstatSync(source).isDirectory();
const getDirectories = source => {
    return fs.readdirSync(source)
        .map(name => Path.join(source, name))
        .filter(isDirectory)
        .filter(d => Path.basename(d) !== '.git' && Path.basename(d) !== '.hg');
};
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
    const ig = ignore().add(parsed);

    return list.filter(l => !ig.ignores(l));
};

module.exports = {
    isDirectory: isDirectory,
    getDirectories: getDirectories,
    getCFiles: getCFiles,
    getAllDirectories: getAllDirectories,
    getAllCFiles: getAllCFiles,
    ignoreAndFilter: ignoreAndFilter
};
