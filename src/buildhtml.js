import path from "path";
import fs from "fs-extra";

export function buildHtml(options, callback) {
    options.fileMappings = options.fileMappings || {};
    options.templateData = options.templateData || {};
/*
    var options = {
        sourceFolders: [""],
        destFolder: "",
        fileMappings: {
            "index.ejs": "variation.html",
            "index-report.ejs": "variation-report.html",
            "index-ie.ejs": "variation-ie.html"
        },
        templateData: {}
    }
*/
    var sourceFiles = {};
    for (let i = 0; i < options.sourceFolders.length; i++) {
        let files = fs.readdirSync(options.sourceFolders[i]);
        for (let j = 0; j < files.length; j++) {
            if (files[j].indexOf(".html") > 0) sourceFiles[files[j]] = path.resolve(options.sourceFolders[i], files[j]);
            if (files[j].indexOf(".ejs") > 0) sourceFiles[files[j]] = path.resolve(options.sourceFolders[i], files[j]);
        }
    }

    for (let fn in sourceFiles) {
        let htmlContent = "";
        let outputFilename = options.fileMappings[fn] || fn;
        let template = fs.readFileSync(sourceFiles[fn], "utf8");
        if (fn.indexOf(".ejs") > 0) {
            // todo: compile
            htmlContent = template;
        }
        else {
            htmlContent = template;
        }
        fs.writeFileSync(path.resolve(options.destFolder, outputFilename), htmlContent);
    }

    callback();

}
