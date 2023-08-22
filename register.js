/**
 * Overrides the tsconfig used for the app.
 * In the test environment we need some tweaks.
 */

const tsNode = require('ts-node');
const tsConfigPaths = require('tsconfig-paths');
const mainTSConfig = require('./src/server/tsconfig.json');

tsConfigPaths.register({
    baseUrl: './src/server/tests',
    paths: {
        ...mainTSConfig.compilerOptions.paths,
    }
});

tsNode.register({
    files: true,
    transpileOnly: true,
    project: './src/server/tsconfig.json'
});
