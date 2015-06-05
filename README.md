# Virtual File System for Node.js

Mount virtual files to your `fs` filesystem.

```javascript
var nodefs = require("nodefs");

var layer = {
    "test/index.js": "console.log('Hello World!')",
    "text.txt": "Hello again!"
    // ...
};

nodefs.mount("./", layer);
require("./test/index.js"); // Hello World!

var fs = require("fs");
console.log(fs.readFileSync("text.txt").toString()); // Hello again!
```

Why is it useful? It is used in `nodefs-drive` package to pack your Node.js projects into a single `.js` file.
When you run the file, `nodefs` creates the virtual file system and you app runs as if it was running from your hard drive.
