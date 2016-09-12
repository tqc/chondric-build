import path from "path";

var browserify = require("browserify-incremental");
var es6ify = require("es6ify");
var stringify = require('stringify');

var remapify = require("remapify");
var filterTransform = require("filter-transform");
var uglify = require('gulp-uglify');
var buffer = require('vinyl-buffer');
var vinylSourceStream = require('vinyl-source-stream');
var stripify = require("stripify");

var gulp = require('gulp');

var fs = require("fs");



var esVersions = {};
function getESVersion(file) {

    // inside node modules
    var nmi = file.lastIndexOf("node_modules") + 13;

    var nmp = file.substr(0, nmi);

    var seg = file.substr(nmi).split(path.sep);

    var pkgPath = path.resolve(nmp, seg[0], "package.json");
    if (esVersions[pkgPath]) return esVersions[pkgPath];

    // scoped packages may have an extra folder level
    if (!fs.existsSync(pkgPath)) {
        pkgPath = path.resolve(nmp, seg[0], seg[1], "package.json");
    }

    if (esVersions[pkgPath]) return esVersions[pkgPath];

    // no package found, assume es5
    if (!fs.existsSync(pkgPath)) {
        esVersions[pkgPath] = 5;
        return 5;
    }

    var pkg = JSON.parse(fs.readFileSync(pkgPath), "utf8");
    if (pkg["esnext:main"] && pkg["esnext:main"] == pkg["main"]) {
        //console.log("found es6 only package in " + pkgPath);
        esVersions[pkgPath] = 6;
        return 6;
    }
    if (pkg["esnext:main"]) {
        // todo: this isn't quite right - could be looking at a file in the dist folder
        esVersions[pkgPath] = 6;
        return 6;
    }
    else {
        esVersions[pkgPath] = 5;
        return 5;
    }

}


var filteredEs6ify = filterTransform(
    function(file) {
        // browserify needs transforms to be global, and compiling es5 modules
        // breaks stuff, so only compile the bits we know are es6

        // no need to compile something that isn't javascript
        if (path.extname(file) != ".js") return false;

        // find the package path
        if (file.indexOf("node_modules") >= 0) {
            return getESVersion(file) == 6;
        }
        else {
            // console.log("building local file as es6");
            // local file or linked module
            // todo: still need to check for package.json
            return true;
        }
    },
    es6ify
);


es6ify.traceurOverrides = {
    annotations: true,
    types: true,
    memberVariables: true
};




export function buildClientJs(opts, onComplete) {
    console.log("starting browserify build");
    var options = opts.options;
    var tempFolder = opts.tempFolder;
    var debugMode = opts.debugMode;


    var moduleMappings = [{
        src: 'hostsettings.js',
        expose: 'build',
        cwd: tempFolder
    }];
    for (let k in options.moduleMappings) {
        moduleMappings.push({
            src: './**/*.html',
            expose: k,
            cwd: options.moduleMappings[k]
        });
        moduleMappings.push({
            src: './**/*.js',
            expose: k,
            cwd: options.moduleMappings[k]
        });
    }
    console.log("Mapping modules");
    for (let i = 0; i < moduleMappings.length; i++) {
        var m = moduleMappings[i];
        if (i > 0 && m.expose == moduleMappings[i - 1].expose) continue;
        console.log(m.expose + " => " + m.cwd);
    }



    var globalShim = filterTransform(
        function(file) {
            return path.extname(file) === ".js";
        },
        require('browserify-global-shim').configure(options.globals)
    );




    var b = browserify(
        {
            debug: debugMode,
            extensions: [".txt", ".html"],
            cacheFile: path.resolve(tempFolder, "browserify-cache.json")
        })
        .add(es6ify.runtime, {
            entry: true
        })
        .plugin(remapify, moduleMappings)
        .transform(stringify({
            extensions: ['.txt', '.html'],
            minify: true
        }), {
            global: true
        });


    for (let i = 0; i < options.customBrowserifyTransforms.length; i++) {
        b = b.transform(options.customBrowserifyTransforms[i]());
    }

    b = b.transform(filteredEs6ify, {
        global: true
    });

    b = b.transform(globalShim, {
        global: true
    });

    if (!debugMode) {
        // remove console.log calls
        b = b.transform({
            global: true
        }, stripify);
    }
    if (debugMode && options.browserTests) {
        // inject tests
        b.require(require.resolve(path.resolve(process.cwd(), options.browserTests)), {
            expose: "test",
            entry: true
        });
    }
    if (debugMode) {
        // set debug mode in client script
        b.require(require.resolve(path.resolve(__dirname, "setdebugmode.js")), {
            expose: "debug",
            entry: true
        });
    }
    b.require(require.resolve(opts.src), {
        entry: true
    });

    var statusReporter = require("browserify-build-status");

    b.plugin(
        statusReporter,
        {
            selector: ".chondric-viewport,[chondric-viewport]",
            onComplete: onComplete,
            onError: onComplete
        }
    );
    b = b.bundle();


    if (debugMode) {
        b.pipe(statusReporter.writeFile(opts.dest));
    } else {
        var fn = path.basename(opts.dest);
        var dir = opts.dest.substr(0, opts.dest.length - fn.length - 1);
        b = b
            .pipe(vinylSourceStream(fn)) // gives streaming vinyl file object
            .pipe(buffer()) // <----- convert from streaming to buffered vinyl file object
            .pipe(uglify({
                mangle: true,
                compress: false
            }))
            .pipe(gulp.dest(dir));
    }

}