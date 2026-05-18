const fs = require("fs");
const path = require("path");
const JavaScriptObfuscator = require("javascript-obfuscator");
const terser = require("terser");

const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const distDir = path.join(rootDir, "dist");

const obfuscatorOptions = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.35,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.25,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: "hexadecimal",
    renameGlobals: false,
    rotateStringArray: true,
    selfDefending: false,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 8,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ["base64"],
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
};

const terserOptions = {
    compress: {
        passes: 2
    },
    mangle: true,
    format: {
        comments: false
    }
};

async function buildFile(fileName) {
    const sourcePath = path.join(srcDir, fileName);
    const outName = fileName.replace(/\.js$/i, ".min.js");
    const outPath = path.join(distDir, outName);
    const source = fs.readFileSync(sourcePath, "utf8");

    const obfuscated = JavaScriptObfuscator
        .obfuscate(source, obfuscatorOptions)
        .getObfuscatedCode();

    const minified = await terser.minify(obfuscated, terserOptions);
    if (minified.error) throw minified.error;

    fs.writeFileSync(outPath, `${minified.code}\n`, "utf8");

    const sourceBytes = Buffer.byteLength(source);
    const outBytes = Buffer.byteLength(minified.code);
    console.log(`${fileName} -> dist/${outName} (${sourceBytes}b -> ${outBytes}b)`);
}

async function main() {
    if (!fs.existsSync(srcDir)) {
        throw new Error(`Missing source directory: ${srcDir}`);
    }
    fs.mkdirSync(distDir, { recursive: true });

    const files = fs.readdirSync(srcDir)
        .filter((file) => file.endsWith(".js"))
        .sort();

    if (!files.length) {
        throw new Error(`No .js files found in ${srcDir}`);
    }

    for (const file of files) {
        await buildFile(file);
    }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
