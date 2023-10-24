const path = require("path");
const nodeExternals = require("webpack-node-externals");
const fs = require('fs');
const {DefinePlugin} = require('webpack');

if(process.env.VERSION === undefined) {
    let version = 'unknown';

    if(fs.existsSync('./package.json')) {
        const package = fs.readFileSync('./package.json');
        version = JSON.parse(package).version || 'unknown';
    } else if(fs.existsSync('./package-lock.json')) {
        const packageLock = fs.readFileSync('./package-lock.json');
        version = JSON.parse(packageLock).version || 'unknown';
    }
    process.env.VERSION = version;
}


// Used this article to get CRA and express backed to co-exist on same port for both dev/prod
// https://spin.atomicobject.com/2020/08/17/cra-express-share-code/

const entry = { server: "./src/backend/index.ts" };

module.exports = (env) => {
    //console.log(`webpack env: ${env.production}`);
    let mode = 'development';
    if(env.production) {
        process.env.NODE_ENV = 'production';
        mode = 'production';
    }
    if(process.env.NODE_ENV !== undefined) {
        mode = process.env.NODE_ENV;
    }
    //console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
    return {
        mode: mode,
        target: "node",
        devtool: "source-map",
        entry: entry,
        output: {
            path: path.resolve(__dirname, "build"),
            filename: "[name].js",
        },
        resolve: {
            extensions: [".ts", ".tsx", ".js"],
        },
        plugins: [
            new DefinePlugin({
                VERSION: process.env.VERSION
            })
        ],
        // don't compile node_modules
        externals: [nodeExternals()],
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    use: [
                        {
                            loader: "ts-loader",
                            options: {
                                // use the tsconfig in the server directory
                                configFile: "src/backend/tsconfig.json",
                            },
                        },
                    ],
                },
            ],
        },
    }
};
