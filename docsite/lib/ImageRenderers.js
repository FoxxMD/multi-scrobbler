"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.docs = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
import React from 'react'
const docs = (data, context) => [
    React.createElement("div", { style: { display: 'flex', background: 'black', color: 'white' } }, data.metadata.title),
    {
        width: 1200,
        height: 630,
        fonts: [
            {
                name: 'Inter',
                data: (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '../static/MartianMonoSemiCondensed-Light.ttf')),
                weight: 400,
                style: 'normal',
            },
        ],
    },
];
exports.docs = docs;
