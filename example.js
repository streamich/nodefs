var nodefs = require("./nodefs");

var layer = {
    "test/index.js": "console.log('Hello World!')",
    "text.txt": "Hello again!"
    // ...
};

var drive = nodefs.mount("./", layer);
require("./test/index.js"); // Hello World!

var fs = require("fs");
console.log(fs.readFileSync("text.txt").toString()); // Hello again!
fs.appendFile("text.txt", "!!", function() {
    console.log(fs.readFileSync("text.txt").toString()); // Hello again!
});
console.log(fs.readFileSync("text.txt").toString()); // Hello again!


//console.log(drive.layers);
//console.log(fs.readdirSync('./'));
//console.log(fs.readdirSync('./test'));
//console.log(fs.readdirSync('/'));

//fs.readdir('./', function (err, files) { console.log(files); });
//fs.readdir('./test', function (err, files) { console.log(files); });
//fs.readdir('/', function (err, files) { console.log(files); });