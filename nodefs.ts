/// <reference path="typings/tsd.d.ts" />

// We should not have a dependency on `fs` module. Rather the correct `fs` module is injected into `Drive.attach()`.
//var fs = require('fs');

/**
 * path.resolve
 * path.sep
 * path.relative
 */
var path = require('path');



var time = new Date;


class LNode {

    static fd = -1;

    // Relative path inside `Layer`.
    path: string;

    // Layer where file is to be found.
    layer: Layer;

    // File descriptor, negative, because a real file descriptors cannot be negative.
    fd: number = LNode.fd--;

    constructor(layer, path) {
        this.layer = layer;
        this.path = path;
    }

    getData(): string {
        return '';
    }

    setData(data: string|Buffer) {

    }

    stats() {
        return this.layer.drive.Stats.build(this);
    }

    rename(new_name) {
        new_name = this.layer.getRelativePath(new_name);
        var old_name = this.path;
        this.path = new_name;
        this.layer.nodes[new_name] = this;
        delete this.layer.nodes[old_name];
        return new_name;
    }
}

class LFile extends LNode {

    getData(): string {
        return this.layer.files[this.path];
    }

    setData(data: string|Buffer) {
        this.layer.files[this.path] = data.toString();
    }

    rename(new_name) {
        var old_name = this.path;
        new_name = super.rename(new_name);
        this.layer.files[new_name] = this.layer.files[old_name];
        delete this.layer.files[old_name];
    }
}

class LDirectory extends LNode {

}

/**
 * A single `JSON` file of data mounted to a single mount point.
 */
class Layer {

    /**
     * The root directory at which this layer was mounted.
     */
    mountpoint;

    /**
     * A map of relative file names to file contents 'string'.
     * {
     *  "test.txt": "...."
     *  "some/path/hello.txt": "world ..."
     * }
     */
    files = {};

    /**
     * Relative path mapping to `LNode` objects.
     */
    nodes = {};

    /**
     * A map of pseudo 'file descriptors' to LNodes.
     */
    fds = {};

    // a.k.a `fs`
    drive;

    constructor(mountpoint) {
        this.mountpoint = path.resolve(mountpoint) + path.sep;
    }

    getRelativePath(filepath: string) {
        return path.relative(this.mountpoint, filepath);
    }

    getNode(p: string): LNode {
        var relative = this.getRelativePath(p);
        if(this.nodes[relative]) return this.nodes[relative];
        else return null;
    }

    getFile(p: string): LFile {
        var node = this.getNode(p);
        return node instanceof LFile ? node : null;
    }

    getDirectory(p: string): LDirectory {
        var node = this.getNode(p);
        return node instanceof LDirectory ? node : null;
    }

    getByFd(fd: number): LNode {
        return this.fds[fd];
    }

    addNode(node: LNode) {
        if(node instanceof LFile) {
            this.nodes[node.path] = node;
        }

        this.fds[node.fd] = node;

        var parts = node.path.split(path.sep);
        if(parts.length > 1) {
            var p = parts[0];
            for (var i = 1; i < parts.length; i++) {
                this.nodes[p] = new LDirectory(this, p);
                p += path.sep + parts[i];
            }
        }
    }

    generateNodes(archive = {}) {
        this.files = archive;
        for(var filepath in this.files) {
            var node = new LFile(this, filepath);
            this.addNode(node);
        }
    }

    readdir(p) {
        var rel = path.relative(this.mountpoint, p);
        var expr = "^" + (rel ? rel + "/" : '') + "([^\/]*)(\/)?";
        var files = [];
        var regex = new RegExp(expr);
        for(var npath in this.nodes) {
            var match = npath.match(regex);
            if(match) {
                files.push(match[1]);
            }
        }
        return files;
    }
}


/**
 * A collection of layers, we have this, so that we override functions with `.attach()` only once.
 */
class Drive {

    /**
     * A `fs.Stats` class.
     */
    Stats;

    /**
     * `fs` object that we have extended.
     */
    fs;

    /**
     * Collection of file layers, where the top ones owerride the bottom ones.
     */
    layers: Layer[] = [];

    /**
     * `fs` overrides already attached.
     */
    attached = false;

    readFileSync: (filename, options?) => Buffer|string;
    readFile: (filename, options?, callback?) => void;
    realPathSync;
    realpath;
    statSync;
    lstatSync;
    renameSync;
    rename;
    fstatSync;
    fstat;
    writeFileSync;
    writeFile;
    existsSync;
    exists;
    readdirSync;
    readdir;
    appendFileSync;
    appendFile;

    /**
     * Create our `Stats` class that extends (or does not) the `fs.Stats`.
     * @param fs
     */
    createStatsClass(fs?) {
        function Stats() {
            this.uid = process.getuid();
            this.gid = process.getgid();
            this.rdev = 0;
            this.blksize = 4096;
            this.ino = 0;
            this.size = 0;
            this.blocks = 1;
            this.atime = time;
            this.mtime = time;
            this.ctime = time;
            this.birthtime = time;
            this.dev = 0;
            this.mode = 0;
            this.nlink = 0;

            this._isFile = false;
            this._isDirectory = false;
        }

        if(fs) {
            var tmp = function () {};
            tmp.prototype = fs.Stats.prototype;
            Stats.prototype = new tmp();
            Stats.prototype.constructor = Stats;
        }

        Stats.prototype.isFile = function() {
            return this._isFile;
        };

        Stats.prototype.isDirectory = function() {
            return this._isDirectory;
        };

        Stats.prototype.isSymbolicLink = function() {
            return false;
        };

        Stats.build = (node: LNode|LFile|LDirectory) => {
            var stats = new Stats;
            if(node instanceof LDirectory) {
                stats._isDirectory = true;
            } else if(node instanceof LFile) {
                var data = node.getData();
                stats.size = data.length;
                stats._isFile = true;
            }
            return stats;
        };

        this.Stats = Stats;
    }

    /**
     * Attach this drive to `fs`.
     */
    attach(fs?) {
        if(!arguments.length) fs = require('fs');
        this.createStatsClass(fs);

        var self = this;

        fs = fs || {};


        // fs.readFileSync(filename[, options])
        var readFileSync = fs.readFileSync;
        this.readFileSync = fs.readFileSync = (file, opts) => {
            var f = self.getFile(file);
            if(f) return opts ? f.getData() : new Buffer(f.getData());
            else return readFileSync.apply(fs, arguments);
        };

        // fs.readFile(filename[, options], callback)
        var readFile = fs.readFile;
        this.readFile = fs.readFile = (file, opts, cb) => {
            if(typeof opts == "function") {
                cb = opts;
                opts = {};
            }
            var f = self.getFile(file);
            if(f) {
                process.nextTick(() => {
                    if((typeof opts == "object") && opts.encoding) {
                        cb(null, f.getData());
                    } else {
                        cb(null, new Buffer(f.getData()));
                    }
                });
            }
            else return readFile.apply(fs, arguments);
        };

        // fs.realpathSync(path[, cache])
        var realPathSync = fs.realPathSync;
        this.realPathSync = fs.realPathSync = (file, opts) => {
            //console.log('realPathSync', file);
            var filepath = self.getFilePath(file);
            if(filepath !== null) return filepath;
            else return realPathSync.apply(fs, arguments);
        };

        // fs.realpath(path[, cache], callback)
        var realpath = fs.realpath;
        this.realpath = fs.realpath = (filepath, cache, callback) => {
            if(typeof cache == "function") callback = cache;
            filepath = self.getFilePath(filepath);
            if(filepath !== null) {
                process.nextTick(() => { callback(null, filepath); });
            } else realpath.apply(fs, arguments);
        };

        // fs.statSync(path)
        var statSync = fs.statSync;
        this.statSync = fs.statSync = function(p) {
            //console.log('statSync', p);
            var f = self.getNode(p);
            return f ? f.stats() : statSync.apply(fs, arguments);
        };

        // fs.lstatSync(path)
        var lstatSync = fs.lstatSync;
        this.lstatSync = fs.lstatSync = function(p) {
            var f = self.getNode(p);
            return f ? f.stats() : lstatSync.apply(fs, arguments);
        };

        //fs.renameSync(oldPath, newPath)
        var renameSync = fs.renameSync;
        this.renameSync = fs.renameSync = (oldPath, newPath) => {
            var n = self.getNode(oldPath);
            if(n) n.rename(newPath);
            else return renameSync.apply(fs, arguments);
        };

        //fs.renameSync(oldPath, newPath)
        var rename = fs.rename;
        this.rename = fs.rename = (oldPath, newPath, cb) => {
            var n = self.getNode(oldPath);
            if(n) {
                n.rename(newPath);
                process.nextTick(cb);
            }
            else return rename.apply(fs, arguments);
        };

        //fs.fstatSync(fd)
        var fstatSync = fs.fstatSync;
        this.fstatSync = fs.fstatSync = (fd) => {
            var n = self.getByFd(fd);
            return n ? n.stats() : fstatSync.apply(fs, arguments);
        };

        // fs.fstat(fd, callback)
        var fstat = fs.fstat;
        this.fstat = fs.fstat = (fd, callback) => {
            var n = self.getByFd(fd);
            if(n) process.nextTick(() => { callback(null, n.stats()); });
            else fstat.apply(fs, arguments);
        };

        // fs.writeFileSync(filename, data[, options])
        var writeFileSync = fs.writeFileSync;
        this.writeFileSync = fs.writeFileSync = (filename, data, options?: any) => {
            var n = self.getFile(filename);
            if(n) {
                n.setData(data);
                return undefined;
            } else {
                return writeFileSync.apply(fs, arguments);
            }
        };

        // fs.writeFile(filename, data[, options], callback)
        var writeFile = fs.writeFile;
        this.writeFile = fs.writeFile = (filename, data, options, callback) => {
            if(typeof options == "function") {
                callback = options;
            }

            var n = self.getFile(filename);
            if(n) {
                n.setData(data);
                if(callback) process.nextTick(callback);
            } else {
                writeFile.apply(fs, arguments);
            }
        };

        // fs.existsSync(filename)
        var existsSync = fs.existsSync;
        this.existsSync = fs.existsSync = (filename) => {
            var n = self.getFile(filename);
            return n ? true : existsSync.apply(fs, filename);
        };

        // fs.exists(filename, callback)
        var exists = fs.exists;
        this.exists = fs.exists = (filename, callback) => {
            var n = self.getFile(filename);
            if(n) {
                if(callback) process.nextTick(() => { callback(true); });
            } else {
                writeFile.apply(fs, arguments);
            }
        };

        // Remove duplicates.
        function removeDupes(arr) {
            return arr.sort().filter(function(item, pos, ary) {
                return !pos || item != ary[pos - 1];
            });
        }

        // fs.readdirSync(path)
        var _readdirSync = function (p) {
            var files = [];
            p = path.resolve(p) + '/';
            for(var i = 0; i < this.layers.length; i++) {
                var layer = this.layers[i];
                files = files.concat(layer.readdir(p));
            }
            return files;
        }.bind(this);
        var readdirSync = fs.readdirSync;
        this.readdirSync = fs.readdirSync = (p) => {
            var files = _readdirSync(p);
            try {
                files = files.concat(readdirSync.apply(fs, arguments));
            } catch(e) {
                if(!files.length) throw e;
            }
            return removeDupes(files);
        };

        // fs.readdir(path, callback)
        var readdir = fs.readdir;
        this.readdir = fs.readdir = (p, callback) => {
            var files = _readdirSync(p);
            readdir.call(fs, p, (err, more_files) => {
                if(err) {
                    if(!files.length) {
                        return callback(err);
                    } else {
                        callback(null, files);
                    }
                }
                files = files.concat(more_files);
                callback(null, removeDupes(files));
            });
        };

        // fs.appendFileSync(filename, data[, options])
        var appendFileSync = fs.appendFileSync;
        this.appendFileSync = fs.appendFileSync = (file, data: string|Buffer) => {
            var f = self.getFile(file);
            if(f) f.setData(f.getData() + data.toString());
            else appendFileSync.apply(fs, arguments);
            return undefined;
        };

        //fs.appendFile(filename, data[, options], callback)
        var appendFile = fs.appendFile;
        // TODO: This should  create file in mounted drive if path resolves to inside the mounting point.
        this.appendFile = fs.appendFile = (file, data: string|Buffer, opts, callback?) => {
            if(typeof opts == 'function') {
                callback = opts;
            }
            var f = self.getFile(file);
            if(f) {
                process.nextTick(() => {
                    f.setData(f.getData() + data.toString());
                    if(callback) callback();
                });
            }
            else appendFile.apply(fs, arguments);
        };


        //fs.unlink(path, callback)
        //fs.unlinkSync(path)
        //fs.ftruncate(fd, len, callback)
        //fs.ftruncateSync(fd, len)
        //fs.truncate(path, len, callback)
        //fs.truncateSync(path, len)
        //fs.chown(path, uid, gid, callback)
        //fs.chownSync(path, uid, gid)
        //fs.fchown(fd, uid, gid, callback)
        //fs.fchownSync(fd, uid, gid)
        //fs.lchown(path, uid, gid, callback)
        //fs.lchownSync(path, uid, gid)
        //fs.chmod(path, mode, callback)
        //fs.chmodSync(path, mode)
        //fs.fchmod(fd, mode, callback)
        //fs.fchmodSync(fd, mode)
        //fs.lchmod(path, mode, callback)
        //fs.lchmodSync(path, mode)
        //fs.stat(path, callback)
        //fs.lstat(path, callback)
        //fs.link(srcpath, dstpath, callback)
        //fs.linkSync(srcpath, dstpath)
        //fs.symlink(srcpath, dstpath[, type], callback)
        //fs.symlinkSync(srcpath, dstpath[, type])
        //fs.readlink(path, callback)
        //fs.readlinkSync(path)
        //fs.rmdir(path, callback)
        //fs.rmdirSync(path)
        //fs.mkdir(path[, mode], callback)
        //fs.mkdirSync(path[, mode])
        //fs.close(fd, callback)
        //fs.closeSync(fd)
        //fs.open(path, flags[, mode], callback)
        //fs.openSync(path, flags[, mode])
        //fs.utimes(path, atime, mtime, callback)
        //fs.utimesSync(path, atime, mtime)
        //fs.futimes(fd, atime, mtime, callback)
        //fs.futimesSync(fd, atime, mtime)
        //fs.fsync(fd, callback)
        //fs.fsyncSync(fd)
        //fs.write(fd, buffer, offset, length[, position], callback)
        //fs.write(fd, data[, position[, encoding]], callback)
        //fs.writeSync(fd, buffer, offset, length[, position])
        //fs.writeSync(fd, data[, position[, encoding]])
        //fs.read(fd, buffer, offset, length, position, callback)
        //fs.readSync(fd, buffer, offset, length, position)
        //fs.watchFile(filename[, options], listener)
        //fs.unwatchFile(filename[, listener])
        //fs.watch(filename[, options][, listener])
        //fs.access(path[, mode], callback)
        //fs.accessSync(path[, mode])
        //fs.createReadStream(path[, options])
        //fs.createWriteStream(path[, options])

    }

    addLayer(layer) {
        this.layers.push(layer);
        layer.drive = this;
    }

    getFilePath(p: string) {
        var filepath = path.resolve(p);
        var node = this.getNode(filepath);
        return node ? node : null;
    }

    getNode(p: string): LNode {
        var filepath = path.resolve(p);
        for(var i = 0; i < this.layers.length; i++) {
            var n = this.layers[i].getNode(filepath);
            if(n) return n;
        }
        return null;
    }

    getFile(p: string): LFile {
        var node = this.getNode(p);
        return node instanceof LFile ? node : null;
    }

    getDirectory(p: string): LDirectory {
        var node = this.getNode(p);
        return node instanceof LFile ? node : null;
    }

    getByFd(fd: number): LNode {
        for(var i = 0; i < this.layers.length; i++) {
            var n = this.layers[i].getByFd(fd);
            if(n) return n;
        }
        return null;
    }

    mount(mountpoint: string, archive: any = {}, fs: any = null) {
        var layer = new Layer(mountpoint);
        layer.generateNodes(archive);

        this.addLayer(layer);
        if(!this.attached) {
            this.attach(fs ? fs : require('fs'));
            this.attached = true;
        }
    }

}


var nodefs: any = function nodefs() {

};

nodefs.LNode        = LNode;
nodefs.LFile        = LFile;
nodefs.LDirectory   = LDirectory;
nodefs.Layer        = Layer;
nodefs.Drive        = Drive;
nodefs.volume       = new Drive;

nodefs.mount = function(mountpoint: string, archive: any = {}, fs: any = null) {
    var drive = new Drive;
    drive.mount(mountpoint, archive, fs);
    return drive;
};


export = nodefs;
