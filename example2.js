var nodefs = require("./nodefs");

var layer = {
    "test/index.js": "console.log('Hello World!')",
    "text.txt": "Hello again!"
    // ...
};

var drive = nodefs.mount("/usr", layer, null);
drive.mount("/lib/var/www", {
    "index.php": "<?php echo(123);"
}, null);




console.log(drive.readdirSync("../../../..")); // Hello again!
