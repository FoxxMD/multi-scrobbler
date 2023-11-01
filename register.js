/**
 * Overrides the tsconfig used for the app.
 * In the test environment we need some tweaks.
 */

const tsNode = require('ts-node');
const tsConfigPaths = require('tsconfig-paths');
const mainTSConfig = require('./src/backend/tsconfig.json');
const {parseBool} = require("./src/backend/utils");

tsConfigPaths.register({
    baseUrl: './src/backend/tests',
    paths: {
        ...mainTSConfig.compilerOptions.paths,
    }
});

tsNode.register({
    files: true,
    transpileOnly: true,
    project: './src/backend/tsconfig.json'
});

process.env.CONSOLE_LEVEL = parseBool(process.env.DEBUG_MODE) ? undefined : 'false';
process.env.FILE_LEVEL = 'false';
