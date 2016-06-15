import path from "path";
import fs from "fs-extra";
import ejs from "ejs";

export function buildHtml(options, callback) {
    options.fileMappings = options.fileMappings || {};
    options.templateData = options.templateData || {};
/*
    var options = {
        sourceFolders: [""],
        destFolder: "",
        fileMappings: {
            "index": "variation",
            "index-report": "variation-report",
            "index-ie": "variation-ie"
        },
        templateData: {}
    }
*/
    console.log(options.fileMappings);
    console.log(options.templateData);

    console.log("Looking for ejs / html in ");
    console.log(options.sourceFolders);
    var sourceFiles = {};
    for (let i = 0; i < options.sourceFolders.length; i++) {
        let files = fs.readdirSync(options.sourceFolders[i]);
        for (let j = 0; j < files.length; j++) {
            var basename = files[j].replace(/(\.html)|(\.ejs)/, "");
//            if (files[j].indexOf(".html") > 0) sourceFiles[basename] = path.resolve(options.sourceFolders[i], files[j]);
            if (files[j].indexOf(".ejs") > 0) sourceFiles[basename] = path.resolve(options.sourceFolders[i], files[j]);
        }
    }
    for (let fn in sourceFiles) {
        let htmlContent = "";
        let outputFilename = (options.fileMappings[fn] || fn) + ".html";
        let template = fs.readFileSync(sourceFiles[fn], "utf8");
        htmlContent = ejs.render(template, options.templateData);
        fs.writeFileSync(path.resolve(options.destFolder, outputFilename), htmlContent);
    }

    callback();

}
