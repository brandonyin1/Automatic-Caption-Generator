'use strict';

// Bundles src/ into the single distributable file, exactly as it's always
// been named and located - nothing downstream (electron/main.js, the GitHub
// release process) needs to know this is now generated rather than
// hand-written.
//
// Deliberately plain text assembly, no bundler dependency: every feature
// module is just `export const xMethods = { ... }` and the core module is
// `export class ProfessionalCaptionGenerator { ... }`, composed via
// Object.assign - there's no real module graph to resolve, so a real
// bundler (esbuild, etc.) buys nothing here except risk. Concretely, it was
// tried first and silently dropped comments immediately preceding `const`/
// `let` statements inside method bodies (a known esbuild parser quirk,
// reproducible even unbundled/unminified) - unacceptable for a codebase
// this densely commented. Plain string concatenation never re-parses the
// JS at all, so it can't lose anything.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT_FILE = path.join(ROOT, 'Automatic Caption Generator v2.html');

const CSS_FILES = [
    'src/styles/theme.css',
    'src/styles/layout.css',
    'src/styles/components.css',
    'src/styles/viewer.css'
];

// Order doesn't affect behavior (Object.assign onto one prototype), but a
// fixed order keeps the generated file's diff stable across builds.
const FEATURE_MODULES = [
    'transcription',
    'segmentation',
    'quality',
    'editing',
    'fileManagement',
    'settings',
    'sessionRecovery',
    'exportDownload',
    'player',
    'electronIntegration',
    'orchestration'
];

function extractExportedObjectBody(source, exportName, filePath) {
    const re = new RegExp(`^export const ${exportName} = \\{([\\s\\S]*)\\};\\s*$`);
    const match = source.match(re);
    if (!match) {
        throw new Error(`Could not find "export const ${exportName} = { ... };" in ${filePath}`);
    }
    return match[1];
}

function extractExportedClassBody(source, className, filePath) {
    const re = new RegExp(`^export class ${className} \\{([\\s\\S]*)\\}\\s*$`);
    const match = source.match(re);
    if (!match) {
        throw new Error(`Could not find "export class ${className} { ... }" in ${filePath}`);
    }
    return match[1];
}

function build() {
    const coreFile = path.join(ROOT, 'src/core/CaptionGenerator.js');
    const classBody = extractExportedClassBody(
        fs.readFileSync(coreFile, 'utf8'),
        'ProfessionalCaptionGenerator',
        coreFile
    );

    const methodObjectBodies = FEATURE_MODULES.map(name => {
        const filePath = path.join(ROOT, 'src/features', name + '.js');
        return extractExportedObjectBody(
            fs.readFileSync(filePath, 'utf8'),
            name + 'Methods',
            filePath
        );
    });

    const bootstrap = fs.readFileSync(path.join(ROOT, 'src/bootstrap.js'), 'utf8');

    const jsBundle = [
        `class ProfessionalCaptionGenerator {${classBody}}`,
        '',
        `Object.assign(ProfessionalCaptionGenerator.prototype, {${methodObjectBodies.join(',\n\n')}});`,
        '',
        bootstrap.trim()
    ].join('\n');

    const cssBundle = CSS_FILES
        .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8').trim())
        .join('\n\n');

    const template = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');

    if (!template.includes('<!--BUILD:CSS-->')) {
        throw new Error('src/index.html is missing the <!--BUILD:CSS--> placeholder');
    }
    if (!template.includes('<!--BUILD:JS-->')) {
        throw new Error('src/index.html is missing the <!--BUILD:JS--> placeholder');
    }

    // Function replacers, not strings - the JS bundle is dense with comments
    // that legitimately contain $&/$'/$$ as literal text (including, ironically,
    // the very comment explaining why applyFindReplace() needs a function
    // replacer instead of a string one) - a string replacement argument would
    // interpret those as special patterns instead of literal characters.
    const output = template
        .replace('<!--BUILD:CSS-->', () => `<style>\n${cssBundle}\n</style>`)
        .replace('<!--BUILD:JS-->', () => `<script>\n'use strict';\n\n${jsBundle}\n</script>`);

    fs.writeFileSync(OUT_FILE, output);
    console.log(`Built ${OUT_FILE} (${(output.length / 1024).toFixed(0)} KB)`);
}

try {
    build();
} catch (error) {
    console.error(error);
    process.exit(1);
}
