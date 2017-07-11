/// <reference path="typings/tsd.d.ts" />
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
// We should not have a dependency on `fs` module. Rather the correct `fs` module is injected into `Drive.attach()`.
//var fs = require('fs');
/**
 * path.resolve
 * path.sep
 * path.relative
 */
var path = require('path');
var time = new Date;
var LNode = (function () {
    function LNode(layer, path) {
        // File descriptor, negative, because a real file descriptors cannot be negative.
        this.fd = LNode.fd--;
        this.layer = layer;
        this.path = path;
    }
    LNode.prototype.getData = function () {
        return '';
    };
    LNode.prototype.setData = function (data) {
    };
    LNode.prototype.getPath = function () {
        return this.layer.mountpoint + this.path;
    };
    LNode.prototype.stats = function () {
        return this.layer.drive.Stats.build(this);
    };
    LNode.prototype.rename = function (new_name) {
        new_name = this.layer.getRelativePath(new_name);
        var old_name = this.path;
        this.path = new_name;
        this.layer.nodes[new_name] = this;
        delete this.layer.nodes[old_name];
        return new_name;
    };
    LNode.fd = -1;
    return LNode;
})();
var LFile = (function (_super) {
    __extends(LFile, _super);
    function LFile() {
        _super.apply(this, arguments);
    }
    LFile.prototype.getData = function () {
        return this.layer.files[this.path];
    };
    LFile.prototype.setData = function (data) {
        this.layer.files[this.path] = data.toString();
    };
    LFile.prototype.rename = function (new_name) {
        var old_name = this.path;
        new_name = _super.prototype.rename.call(this, new_name);
        this.layer.files[new_name] = this.layer.files[old_name];
        delete this.layer.files[old_name];
    };
    return LFile;
})(LNode);
var LDirectory = (function (_super) {
    __extends(LDirectory, _super);
    function LDirectory() {
        _super.apply(this, arguments);
    }
    return LDirectory;
})(LNode);
/**
 * A single `JSON` file of data mounted to a single mount point.
 */
var Layer = (function () {
    function Layer(mountpoint) {
        /**
         * Array of directory steps to the `mountpoint`.
         */
        this.steps = [];
        /**
         * A map of relative file names to file contents 'string'.
         * {
         *  "test.txt": "...."
         *  "some/path/hello.txt": "world ..."
         * }
         */
        this.files = {};
        /**
         * Relative path mapping to `LNode` objects.
         */
        this.nodes = {};
        /**
         * A map of pseudo 'file descriptors' to LNodes.
         */
        this.fds = {};
        this.mountpoint = path.resolve(mountpoint);
        this.steps = this.mountpoint.split(path.sep);
        this.mountpoint += path.sep;
    }
    Layer.prototype.getRelativePath = function (filepath) {
        return path.relative(this.mountpoint, filepath);
    };
    Layer.prototype.getNode = function (p) {
        var relative = this.getRelativePath(p);
        if (this.nodes[relative])
            return this.nodes[relative];
        else
            return null;
    };
    Layer.prototype.getFile = function (p) {
        var node = this.getNode(p);
        return node instanceof LFile ? node : null;
    };
    Layer.prototype.getDirectory = function (p) {
        var node = this.getNode(p);
        return node instanceof LDirectory ? node : null;
    };
    Layer.prototype.getByFd = function (fd) {
        return this.fds[fd];
    };
    Layer.prototype.addNode = function (node) {
        if (node instanceof LFile) {
            this.nodes[node.path] = node;
        }
        this.fds[node.fd] = node;
        var parts = node.path.split(path.sep);
        if (parts.length > 1) {
            var p = parts[0];
            for (var i = 1; i < parts.length; i++) {
                this.nodes[p] = new LDirectory(this, p);
                p += path.sep + parts[i];
            }
        }
    };
    Layer.prototype.generateNodes = function (archive) {
        if (archive === void 0) { archive = {}; }
        this.files = archive;
        for (var filepath in this.files) {
            var node = new LFile(this, filepath);
            this.addNode(node);
        }
    };
    /**
     * Return relative path if the path is insided the mounting point of this layer.
     * @param p
     */
    Layer.prototype.relativePathIfInMp = function (p) {
        var rel = path.relative(this.mountpoint, p);
        console.log(rel);
        if ((rel[0] == '.') && (rel[1] == '.'))
            return false;
        else
            return rel;
    };
    /**
     * Path points to above or to mount point.
     * @param abs_path
     * @returns {boolean}
     */
    Layer.prototype.isAboveMp = function (abs_path) {
        return abs_path == this.mountpoint.substr(0, abs_path.length);
    };
    /**
     * Path points inside or to mount point.
     * @param abs_path
     * @returns {boolean}
     */
    Layer.prototype.isInMp = function (abs_path) {
        return this.mountpoint == abs_path.substr(0, this.mountpoint.length);
    };
    Layer.prototype.stepsMatch = function (steps) {
        var min = Math.min(steps.length, this.steps.length);
        for (var i = 0; i < min; i++) {
            if (steps[i] != this.steps[i])
                break;
        }
        return i;
    };
    Layer.prototype.readdir = function (abs_path) {
        if (!abs_path)
            return [];
        // Edge case when we have '/'.
        if (abs_path[abs_path.length - 1] == path.sep)
            abs_path = abs_path.substr(0, abs_path.length - 1);
        var steps = abs_path.split(path.sep);
        var steps_match = this.stepsMatch(steps);
        var points_to_mountpoint = this.steps.length == steps_match;
        // Is not pointing to or inside the mount point.
        if (!points_to_mountpoint) {
            if (steps_match == steps.length) {
                return this.steps[steps_match];
            }
            else {
                return [];
            }
        }
        // Points to or inside the mount point.
        var rel = path.relative(this.mountpoint, abs_path);
        var expr = "^" + (rel ? rel + path.sep : '') + "([^" + path.sep + "]*)(" + path.sep + ")?";
        var files = [];
        var regex = new RegExp(expr);
        for (var npath in this.nodes) {
            var match = npath.match(regex);
            if (match) {
                files.push(match[1]);
            }
        }
        return files;
    };
    return Layer;
})();
/**
 * A collection of layers, we have this, so that we override functions with `.attach()` only once.
 */
var Drive = (function () {
    function Drive() {
        /**
         * Collection of file layers, where the top ones owerride the bottom ones.
         */
        this.layers = [];
        /**
         * `fs` overrides already attached.
         */
        this.attached = false;
    }
    /**
     * Create our `Stats` class that extends (or does not) the `fs.Stats`.
     * @param fs
     */
    Drive.prototype.createStatsClass = function (fs) {
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
        if (fs) {
            var tmp = function () {
            };
            tmp.prototype = fs.Stats.prototype;
            Stats.prototype = new tmp();
            Stats.prototype.constructor = Stats;
        }
        Stats.prototype.isFile = function () {
            return this._isFile;
        };
        Stats.prototype.isDirectory = function () {
            return this._isDirectory;
        };
        Stats.prototype.isSymbolicLink = function () {
            return false;
        };
        Stats.build = function (node) {
            var stats = new Stats;
            if (node instanceof LDirectory) {
                stats._isDirectory = true;
            }
            else if (node instanceof LFile) {
                var data = node.getData();
                stats.size = data.length;
                stats._isFile = true;
            }
            return stats;
        };
        this.Stats = Stats;
    };
    /**
     * Attach this drive to `fs`.
     */
    Drive.prototype.attach = function (fs) {
        if (!arguments.length)
            fs = require('fs');
        this.createStatsClass(fs);
        var self = this;
        fs = fs || {};
        // fs.readFileSync(filename[, options])
        var readFileSync = fs.readFileSync;
        this.readFileSync = fs.readFileSync = function (file, opts) {
            var f = self.getFile(file);
            if (f)
                return opts ? f.getData() : new Buffer(f.getData());
            else
                return readFileSync.apply(fs, arguments);
        };
        // fs.readFile(filename[, options], callback)
        var readFile = fs.readFile;
        this.readFile = fs.readFile = function (file, opts, cb) {
            if (typeof opts == "function") {
                cb = opts;
                opts = {};
            }
            var f = self.getFile(file);
            if (f) {
                process.nextTick(function () {
                    if ((typeof opts == "object") && opts.encoding) {
                        cb(null, f.getData());
                    }
                    else {
                        cb(null, new Buffer(f.getData()));
                    }
                });
            }
            else
                return readFile.apply(fs, arguments);
        };
        // fs.realpathSync(path[, cache])
        var realpathSync = fs.realpathSync;
        this.realpathSync = fs.realpathSync = function (file, opts) {
            var node = self.getNode(file);
            if (node)
                return node.getPath();
            else
                return realpathSync.apply(fs, arguments);
        };
        // fs.realpath(path[, cache], callback)
        var realpath = fs.realpath;
        this.realpath = fs.realpath = function (filepath, cache, callback) {
            if (typeof cache == "function")
                callback = cache;
            var node = self.getNode(filepath);
            if (node) {
                process.nextTick(function () {
                    callback(null, node.getPath());
                });
            }
            else
                realpath.apply(fs, arguments);
        };
        // fs.statSync(path)
        var statSync = fs.statSync;
        this.statSync = fs.statSync = function (p) {
            //console.log('statSync', p);
            var f = self.getNode(p);
            return f ? f.stats() : statSync.apply(fs, arguments);
        };
        // fs.lstatSync(path)
        var lstatSync = fs.lstatSync;
        this.lstatSync = fs.lstatSync = function (p) {
            var f = self.getNode(p);
            return f ? f.stats() : lstatSync.apply(fs, arguments);
        };
        //fs.renameSync(oldPath, newPath)
        var renameSync = fs.renameSync;
        this.renameSync = fs.renameSync = function (oldPath, newPath) {
            var n = self.getNode(oldPath);
            if (n)
                n.rename(newPath);
            else
                return renameSync.apply(fs, arguments);
        };
        //fs.renameSync(oldPath, newPath)
        var rename = fs.rename;
        this.rename = fs.rename = function (oldPath, newPath, cb) {
            var n = self.getNode(oldPath);
            if (n) {
                n.rename(newPath);
                process.nextTick(cb);
            }
            else
                return rename.apply(fs, arguments);
        };
        //fs.fstatSync(fd)
        var fstatSync = fs.fstatSync;
        this.fstatSync = fs.fstatSync = function (fd) {
            var n = self.getByFd(fd);
            return n ? n.stats() : fstatSync.apply(fs, arguments);
        };
        // fs.fstat(fd, callback)
        var fstat = fs.fstat;
        this.fstat = fs.fstat = function (fd, callback) {
            var n = self.getByFd(fd);
            if (n)
                process.nextTick(function () {
                    callback(null, n.stats());
                });
            else
                fstat.apply(fs, arguments);
        };
        // fs.writeFileSync(filename, data[, options])
        var writeFileSync = fs.writeFileSync;
        this.writeFileSync = fs.writeFileSync = function (filename, data, options) {
            var n = self.getFile(filename);
            if (n) {
                n.setData(data);
                return undefined;
            }
            else {
                return writeFileSync.apply(fs, arguments);
            }
        };
        // fs.writeFile(filename, data[, options], callback)
        var writeFile = fs.writeFile;
        this.writeFile = fs.writeFile = function (filename, data, options, callback) {
            if (typeof options == "function") {
                callback = options;
            }
            var n = self.getFile(filename);
            if (n) {
                n.setData(data);
                if (callback)
                    process.nextTick(callback);
            }
            else {
                writeFile.apply(fs, arguments);
            }
        };
        // fs.existsSync(filename)
        var existsSync = fs.existsSync;
        this.existsSync = fs.existsSync = function (filename) {
            var n = self.getFile(filename);
            return n ? true : existsSync.apply(fs, arguments);
        };
        // fs.exists(filename, callback)
        var exists = fs.exists;
        this.exists = fs.exists = function (filename, callback) {
            var n = self.getFile(filename);
            if (n) {
                if (callback)
                    process.nextTick(function () {
                        callback(true);
                    });
            }
            else {
                writeFile.apply(fs, arguments);
            }
        };
        // Remove duplicates.
        function removeDupes(arr) {
            return arr.sort().filter(function (item, pos, ary) {
                return !pos || item != ary[pos - 1];
            });
        }
        // fs.readdirSync(path)
        var _readdirSync = function (p) {
            var files = [];
            p = path.resolve(p);
            for (var i = 0; i < this.layers.length; i++) {
                var layer = this.layers[i];
                files = files.concat(layer.readdir(p));
            }
            return files;
        }.bind(this);
        var readdirSync = fs.readdirSync;
        this.readdirSync = fs.readdirSync = function (p) {
            var files = _readdirSync(p);
            if (readdirSync) {
                try {
                    files = files.concat(readdirSync.apply(fs, arguments));
                }
                catch (e) {
                    if (!files.length)
                        throw e;
                }
            }
            return removeDupes(files);
        };
        // fs.readdir(path, callback)
        var readdir = fs.readdir;
        this.readdir = fs.readdir = function (p, callback) {
            var files = _readdirSync(p);
            if (readdir) {
                readdir.call(fs, p, function (err, more_files) {
                    if (err) {
                        if (!files.length) {
                            return callback(err);
                        }
                        else {
                            callback(null, files);
                        }
                    }
                    files = files.concat(more_files);
                    callback(null, removeDupes(files));
                });
            }
            else {
                process.nextTick(function () {
                    callback(null, removeDupes(files));
                });
            }
        };
        // fs.appendFileSync(filename, data[, options])
        var appendFileSync = fs.appendFileSync;
        this.appendFileSync = fs.appendFileSync = function (file, data) {
            var f = self.getFile(file);
            if (f)
                f.setData(f.getData() + data.toString());
            else
                appendFileSync.apply(fs, arguments);
            return undefined;
        };
        //fs.appendFile(filename, data[, options], callback)
        var appendFile = fs.appendFile;
        // TODO: This should  create file in mounted drive if path resolves to inside the mounting point.
        this.appendFile = fs.appendFile = function (file, data, opts, callback) {
            if (typeof opts == 'function') {
                callback = opts;
            }
            var f = self.getFile(file);
            if (f) {
                process.nextTick(function () {
                    f.setData(f.getData() + data.toString());
                    if (callback)
                        callback();
                });
            }
            else
                appendFile.apply(fs, arguments);
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
    };
    Drive.prototype.addLayer = function (layer) {
        this.layers.push(layer);
        layer.drive = this;
    };
    Drive.prototype.getFilePath = function (p) {
        var filepath = path.resolve(p);
        var node = this.getNode(filepath);
        return node ? node : null;
    };
    Drive.prototype.getNode = function (p) {
        var filepath = path.resolve(p);
        for (var i = 0; i < this.layers.length; i++) {
            var n = this.layers[i].getNode(filepath);
            if (n)
                return n;
        }
        return null;
    };
    Drive.prototype.getFile = function (p) {
        var node = this.getNode(p);
        return node instanceof LFile ? node : null;
    };
    Drive.prototype.getDirectory = function (p) {
        var node = this.getNode(p);
        return node instanceof LFile ? node : null;
    };
    Drive.prototype.getByFd = function (fd) {
        for (var i = 0; i < this.layers.length; i++) {
            var n = this.layers[i].getByFd(fd);
            if (n)
                return n;
        }
        return null;
    };
    // TODO: Mount from URL:
    // TODO: `mount('/usr/lib', 'http://example.com/volumes/usr/lib.json', callback)`
    // TODO: ...also cache that it has been loaded...
    Drive.prototype.mount = function (mountpoint, archive, fs) {
        if (archive === void 0) { archive = {}; }
        var layer = new Layer(mountpoint);
        layer.generateNodes(archive);
        this.addLayer(layer);
        if (!this.attached) {
            this.attach(fs || (fs === null) ? fs : require('fs'));
            this.attached = true;
        }
    };
    return Drive;
})();
var nodefs = function nodefs() {
};
nodefs.LNode = LNode;
nodefs.LFile = LFile;
nodefs.LDirectory = LDirectory;
nodefs.Layer = Layer;
nodefs.Drive = Drive;
nodefs.volume = new Drive;
nodefs.mount = function (mountpoint, archive, fs) {
    if (archive === void 0) { archive = {}; }
    if (fs === void 0) { fs = null; }
    var drive = new Drive;
    drive.mount(mountpoint, archive, fs);
    return drive;
};
module.exports = nodefs;
