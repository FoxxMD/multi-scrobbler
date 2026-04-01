#!/usr/bin/env bash

echo 'Adding node_modules to path'
echo 'export PATH=/workspaces/node_modules/.bin:/workspaces/docsite/node_modules/.bin:$PATH' >> /home/node/.bashrc

echo 'Updating npm...'
npm install -g npm@11.12.1

echo 'Installing concurrently...'
npm install -g concurrently

echo 'If you have freshly cloned this project or node_modules folder does not exist then you should run "npm run install:parallel" now'