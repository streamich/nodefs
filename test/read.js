var nodefs = require('../nodefs');


var mountpoint = '/code/nodefs';
var archive = {
    "tmp/test.js": "console.log(123);"
};

//var drive = new nodefs.Drive;
//drive.attach({});
//drive.mount(mountpoint, archive);

var drive = nodefs.mount(mountpoint, archive);

console.log(drive.layers);

var fs = require('fs');

//console.log(fs.readFileSync('/code/nodefs/tmp/test.js').toString());
console.log(fs.statSync('/code/nodefs/tmp/test.js'));
//fs.readFile('/code/nodefs/tmp/test.js', function(err, res) {
//    console.log(res.toString());
//});
require("/code/nodefs/tmp/test.js");
//require("../tmp/test.js");
