// mocha config for `npm run test:leaks`, see leakProbe.ts
// Same as .mocharc.json but never force exits (so leaks are detectable) and loads the probe first.
// mocha appends CLI spec args to the config spec, so when test files are given on the CLI the config spec is dropped to run only those.
const base = require('../../../../.mocharc.json');

const cliSpec = process.argv.slice(2).some(arg => /\.test\.ts$/.test(arg));

module.exports = {
    ...base,
    exit: false,
    require: ['./src/backend/tests/utils/leakProbe.ts'],
    spec: cliSpec ? [] : base.spec,
};
