const path = require("path");
const nodeExternals = require("webpack-node-externals");

// Used this article to get CRA and express backed to co-exist on same port for both dev/prod
// https://spin.atomicobject.com/2020/08/17/cra-express-share-code/

const entry = { server: "./src/server/index.ts" };

module.exports = {
    mode: process.env.NODE_ENV ? process.env.NODE_ENV : "development",
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
                            configFile: "src/server/tsconfig.json",
                        },
                    },
                ],
            },
        ],
    },
};
