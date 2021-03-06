import {buildHtml} from "./buildhtml";
import {buildClientJs as buildBrowserify} from "./buildjs-browserify";
import {buildClientJs as buildRollup} from "./buildjs-rollup";

import * as rebuild from "rebuild-linked";

var modules = rebuild.getModules(process.cwd());
    /* Tools to be called from gulp when building a standard app */

var gulp = require('gulp');
var fs = require("fs-extra");
var path = require("path");


var extend = require("extend");


var chokidar = require('chokidar');

var async = require("async");

var tools = module.exports;
var cwd = process.cwd();

var sass = require('node-sass');

var resolve = require('resolve');

var options = {
    globals: {
        angular: "angular",
        jquery: "$",
        d3: "d3"
    },
    serverapp: {

    },
    sourceFolder: "./src",
    libFolder: "./lib",
    cssEntryPoint: "./css/index.scss",
    moduleMappings: {},
    customBrowserifyTransforms: [],
    additionalWatchPaths: [],
    buildfolder: "./build",
    cssVariations: {
        "ie": '$browserType: "ie";'
    },
    imageFolders: ["./src/images"],
    legacyBrowserError: {
        title: "App Error",
        message: "This app is designed for use in modern browsers."
    },
    templateData: {}
};

tools.init = function(opt) {
    rebuild.ensureModulesBuilt(process.cwd());
    extend(options, opt);
};

tools.test = function() {
    console.log("Test function");
};

tools.buildVariation = function(variation, env, watch, destFolder, onBuildComplete) {
    tools.buildVariations(variation,
        [{
            key: "index",
            title: variation,
            outputScriptName: "app",
            outputHtmlName: "index",
            additionalData: options.templateData || {}
        }].concat(options.subvariations || []),
        env, watch, destFolder, onBuildComplete);
};
tools.buildVariations = function(variationFolderName, subvariations, env, watch, destFolder, onBuildComplete) {

    var cssTimer,
        jsTimer,
        imageTimer;


    console.log(subvariations);
    if (options.useRollup) {
        console.log("Building with Rollup");
    } else {
        console.log("Building with Browserify");
    }

    onBuildComplete = onBuildComplete || function(err) {
        if (!err) {
            console.log("Build of " + variationFolderName + " completed successfully");
        } else {
            console.log(err);
        }
    };
    var debugMode = env != "prod"; //true;
    if (options.debug !== undefined) debugMode = options.debug;
    if (options[env] && options[env].debug !== undefined) debugMode = options[env].debug;
    console.log("Debug: " + debugMode);
    console.log("building " + variationFolderName + " for " + env);
    var buildfolder = path.resolve(cwd, options.buildfolder);
    var tempFolder = path.resolve(buildfolder, "temp-" + variationFolderName + "-" + env);
    var varFolder = path.resolve(buildfolder, env, variationFolderName);
    if (destFolder) varFolder = path.resolve(cwd, destFolder);

    fs.ensureDirSync(tempFolder);
    fs.ensureDirSync(varFolder);

    var hostSettings = {};
    extend(hostSettings, options.hostSettings);
    extend(hostSettings, options[env]);
    fs.writeFileSync(path.resolve(tempFolder, "hostsettings.js"), "module.exports=" + JSON.stringify(hostSettings), "utf-8");

    var sourceFolder = path.resolve(cwd, options.sourceFolder);
    var libFolder = path.resolve(cwd, options.libFolder);

    function buildClientJs(callback) {
        async.eachSeries(subvariations, function(subvariation, next) {
            if (jsTimer) {
                console.log("Change detected while building");
                return next("Change detected while building - cancelling");
            }
            if (!subvariation.outputScriptName) return next();
            if (subvariation.apps && subvariation.apps.indexOf(variationFolderName) < 0) return next();
            var opts = {
                options: options,
                debugMode: debugMode,
                tempFolder: tempFolder,
                allowIncrementalBuild: env == "dev",
                src: path.resolve(sourceFolder, (subvariation.jsEntryPoint || variationFolderName) + ".js"),
                dest: path.resolve(varFolder, (subvariation.outputScriptName || "app") + ".js"),
                moduleMappings: options.moduleMappings
            };
            if (options.useRollup) {
                buildRollup(opts, next);
            }
            else {
                buildBrowserify(opts, next);
            }

            // For use with <script>$.getScript(window.atob ? "app.js" : "app-es3.js");</script>
            // no longer needed but kept for backward compatibility
            var statusReporter = require("browserify-build-status");
            fs.writeFileSync(path.resolve(varFolder, "app-es3.js"), statusReporter.getErrorScript(options.legacyBrowserError.title, options.legacyBrowserError.message));
        }, callback);

    }

    function copyHtml(callback) {
        console.log(subvariations);
        async.eachSeries(subvariations, function(subvariation, next) {
            if (!subvariation.outputHtmlName) return next();
            if (subvariation.apps && subvariation.apps.indexOf(variationFolderName) < 0) return next();
            var td = subvariation.additionalData || options.templateData || {};
            td.app = variationFolderName;
            td.env = env;
            td.variation = subvariation;
            td.options = options;
            var preloadCssPath = path.resolve(varFolder, "inline.css");
            if (fs.existsSync(preloadCssPath)) {
                td.inlineCss = fs.readFileSync(preloadCssPath, "utf-8");
            }
            else {
                td.inlineCss = "";
            }

            buildHtml(
                {
                    options: options,
                    sourceFolders: options.sourceFolders || [sourceFolder],
                    destFolder: varFolder,
                    fileMappings: subvariation.fileMappings || {
                        "index": subvariation.outputHtmlName,
                        "index-ie": subvariation.outputHtmlName + "-ie"
                    },
                    templateData: td
                },
                next);
        }, callback);
    }

    function copyLib(callback) {
        gulp.src(libFolder + '/*.*')
                .pipe(gulp.dest(varFolder + "/lib"))
                .on("end", callback);
    }


    function copyImages(callback) {
        var flatten = require('gulp-flatten');
        console.log("Copying images");
        var globs = [];
        for (let i = 0; i < options.imageFolders.length; i++) {
            var imgf = options.imageFolders[i];
            globs.push(imgf + "/**");
        }
        console.log(globs);

        async.eachSeries(
            globs,
            (glob, next) => {
                try {
                    var imagemin = require('gulp-imagemin');
                    gulp.src(glob)
                            .pipe(flatten())
                            .pipe(imagemin({
                                progressive: true,
                                svgoPlugins: [{
                                    removeViewBox: false
                                }]
                            }))
                            .pipe(gulp.dest(varFolder + "/images"))
                            .on("end", next);
                } catch (ex) {
                        // probably just imagemin not being installed - fall back to regular file copy
                    console.log("Image optimization failed - copying images unmodified.");
                    gulp.src(glob)
                            .pipe(flatten())
                            .pipe(gulp.dest(varFolder + "/images"))
                            .on("end", next);

                }
            },
            callback
        );






    }


        //        function copyImages() {
        //            gulp.src(__dirname + '/apphtml/images/**/*')
        //                .pipe(gulp.dest(options.buildfolder + "/" + env + "/" + variation + "/images"))
        //                .on("end", function() {
        //                    gulp.src(process.cwd() + "/images/**/*")
        //                        .pipe(gulp.dest(options.buildfolder + "/" + env + "/" + variation + "/images"));
        //                });
        //        }

    function buildCssFile(inputFile, outputFile, fileBuilt) {
        sass.render({
            file: inputFile,
            outFile: varFolder + "/" + outputFile,
            sourceMap: true,
            outputStyle: debugMode ? "nested" : "compressed",
            importer: [function(url, prev) {

                    // first check if the file exists as specified
                var f = path.resolve(path.dirname(prev), url);
                if (fs.existsSync(f)) return { file: f };

                    // or with .scss added
                var f2 = path.dirname(f) + "/" + path.basename(f, ".scss") + ".scss";
                if (fs.existsSync(f2)) return { file: f2 };

                    // or with an underscore
                var f3 = path.dirname(f) + "/_" + path.basename(f, ".scss") + ".scss";
                if (fs.existsSync(f3)) return { file: f3 };

                    // try using node resolve
                var f4 = url;
                    // if it includes node_modules, remove it
                if (f4.indexOf("node_modules/") >= 0) {
                    f4 = f4.substr(f4.lastIndexOf("node_modules/") + 13);
                }

                    // resolve with require("resolve")
                try {
                    f4 = resolve.sync(f4, {
                        basedir: path.dirname(prev),
                        extensions: [".scss"]
                    });
                    return {file: f4 };
                }
                    catch (e) {
                        console.log(e);
                        // couldn't resolve it this way - ignore error and fall back to the default
                    }
                return null;
            }]
                // includePaths: ["."]
        }, function(err, result) {
            if (!err) {
                fs.writeFileSync(varFolder + "/" + outputFile, result.css);
                fs.writeFileSync(varFolder + "/" + outputFile + ".map", result.map);
                console.log("Completed sass build of " + inputFile);
            }
            if (fileBuilt) fileBuilt(err, result);
        });
    }

    function buildPreloadCss(onCssBuilt) {
        var cssEntryPoint = path.resolve(cwd, options.cssEntryPoint);
        var preloadCssPath = path.resolve(cssEntryPoint, "../inline.scss");
        console.log(preloadCssPath);
        if (!fs.existsSync(preloadCssPath)) return onCssBuilt && onCssBuilt();

        buildCssFile(preloadCssPath, "inline.css", onCssBuilt);

    }

    function buildCss(onCssBuilt) {
        console.log("Building CSS");
        var cssEntryPoint = path.resolve(cwd, options.cssEntryPoint);


        buildCssFile(cssEntryPoint, "app.css", function(err) {
            if (err) {
                return onCssBuilt && onCssBuilt(err);
            }

            var cssVariations = [];
            for (let k2 in options.cssVariations) {
                cssVariations.push({
                    key: k2,
                    settings: options.cssVariations[k2]
                });
            }

            async.eachSeries(cssVariations, function(v, next) {
                var iesrc = v.settings + '\n@import "' + (path.relative(tempFolder, cssEntryPoint).replace(/\\/ig, "/")) + '";';
                var ieCssFile = path.resolve(tempFolder, "index-" + v.key + ".scss");
                fs.writeFileSync(ieCssFile, iesrc);
                buildCssFile(ieCssFile, "app-" + v.key + ".css", next);
            }, function(err2) {
                if (err2) {
                    return onCssBuilt && onCssBuilt(err2);
                }
                buildPreloadCss(onCssBuilt);
            });


                // preloader

        });

    }

    function afterBuild(callback) {
        if (options.afterBrowserify) options.afterBrowserify(varFolder, env, variationFolderName);
        console.log("Build completed successfully in " + varFolder);
        callback();
    }

    var fullBuild = [buildClientJs, buildCss, copyHtml, copyImages, copyLib, afterBuild];


    function setWatch(callback) {
        callback();
        if (!watch) return;

        function cssChanged() {
            clearTimeout(cssTimer);
            cssTimer = setTimeout(function() {
                console.log("CSS needs rebuild");
                async.series([buildCss], function(err) {
                    if (err) {
                        console.log(err);
                    }
                });
            }, 3000);
        }

        function jsChanged() {
            clearTimeout(jsTimer);
            jsTimer = setTimeout(function() {
                console.log("Browserify package needs rebuild");
                jsTimer = 0;
                async.series([buildClientJs, afterBuild], function() {});
            }, 3000);
        }

        function imageChanged() {
            clearTimeout(imageTimer);
            imageTimer = setTimeout(function() {
                console.log("Updating images");
                async.series([copyImages], function() {});
            }, 3000);
        }

        var paths = [sourceFolder].concat(options.additionalWatchPaths);

        // todo: assuming existence of src folder is not ideal. Unfortunately watching the whole module
        // folder causes severe performance issues.
        for (let i = 0; i < modules.length; i++) {
            var sf = path.resolve(modules[i].path, "src");
            if (fs.existsSync(sf)) paths.push(sf);
            sf = path.resolve(modules[i].path, "clientapp");
            if (fs.existsSync(sf)) paths.push(sf);
            sf = path.resolve(modules[i].path, "api");
            if (fs.existsSync(sf)) paths.push(sf);
        }
        //paths.push.apply(paths, modules.map(m => m.path));

        var cssFolder = path.dirname(path.resolve(cwd, options.cssEntryPoint));
        if (cssFolder.indexOf(sourceFolder) !== 0) paths.push(cssFolder);

        // watch image folders
        for (let i = 0; i < options.imageFolders.length; i++) {
            var imgf = options.imageFolders[i];
            if (imgf.indexOf(sourceFolder) !== 0) paths.push(imgf);
        }
        // watch tests
        if (options.browserTests) {
            paths.push(path.dirname(path.resolve(options.browserTests)));
        }
        console.log("Watching: ");
        console.log(paths);

        var watcher = chokidar.watch(paths, {
            ignored: [/[\/\\]\./, "node_modules", "build", "dist"],
            persistent: true,
            ignoreInitial: true
        });


        watcher.on("all", function(type, file) {
            console.log(type + " event for " + file);
            var ext = path.extname(file);
            if (ext == ".scss") {
                cssChanged();
            } else if (ext == ".js" || ext == ".html") {
                // if the changed file is .js or .html, need to run browserify
                jsChanged();
            } else if (ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".gif") {
                // src/images just needs to be copied if anything changes, and it can't contain anything used by browserify
                imageChanged();
            }
        });
    }

    async.series(fullBuild.concat([setWatch]), onBuildComplete);



};

tools.buildTask = function(cb) {
    var args = process.argv.slice(3);
    if (args.length != 2 || args[0].indexOf("--") !== 0 || args[1].indexOf("--") !== 0) {
        console.log("Invalid arguments for build task");
        console.log("Usage: gulp build --web --dev");
        return;
    }
    var variation = args[0].substr(2);
    var env = args[1].substr(2);


    tools.buildVariation(variation, env, false, null, cb);
};
