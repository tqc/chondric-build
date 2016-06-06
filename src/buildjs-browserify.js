import path from "path";

var browserify = require("browserify");
var es6ify = require("es6ify");
var stringify = require('stringify');

var remapify = require("remapify");
var filterTransform = require("filter-transform");
var uglify = require('gulp-uglify');
var buffer = require('vinyl-buffer');
var vinylSourceStream = require('vinyl-source-stream');
var stripify = require("stripify");

var gulp = require('gulp');


export function buildClientJs(opts, onComplete) {
    var options = opts.options;
    var tempFolder = opts.tempFolder;
    var debugMode = opts.debugMode;

    es6ify.traceurOverrides = {
        annotations: true,
        types: true,
        memberVariables: true
    };

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
    console.log("Mapping modules")
    for (let i = 0; i < moduleMappings.length; i++) {
        var m = moduleMappings[i];
        if (i > 0 && m.expose == moduleMappings[i-1].expose) continue;
        console.log(m.expose + " => " + m.cwd);
    }




    var filteredEs6ify = filterTransform(
        function(file) {
            // browserify needs transforms to be global, and compiling es5 modules
            // breaks stuff, so only compile the bits we know are es6
            if (file.indexOf("node_modules") >= 0) {
                // files under node_modules are only compiled as es6 if they are included in
                // moduleMappings - i.e. if chondric was loaded with npm install rather than npm link
                // note that this breaks if you add module mapping for an es5 module.
                for (let i = 0; i < moduleMappings.length; i++) {
                    var pn = moduleMappings[i].cwd.toLowerCase();
                    if (file.toLowerCase().indexOf(pn) === 0 && file.lastIndexOf("node_modules") < pn.length) {
                        return path.extname(file) === '.js';
                    }
                }
                return false;
            }
            return path.extname(file) === '.js';


        },
        es6ify
    );

    var globalShim = filterTransform(
        function(file) {
            return path.extname(file) === ".js";
        },
        require('browserify-global-shim').configure(options.globals)
    );









    var b = browserify(
        {
            debug: debugMode,
            extensions: [".txt", ".html"]
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
            onComplete: onComplete
        }
    );
    b = b.bundle()


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