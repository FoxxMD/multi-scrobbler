---
toc_min_heading_level: 2
toc_max_heading_level: 5
sidebar_position: 1
title: Common Development
description: Start here for MS development
---

# Development

## Architecture

Multi-scrobbler is written entirely in [Typescript](https://www.typescriptlang.org/). It consists of a backend and frontend. The backend handles all Source/Client logic, mounts web server endpoints that listen for Auth callbacks and Source ingress using [expressjs](https://expressjs.com/), and  serves the frontend. The frontend is a standalone [Vitejs](https://vitejs.dev/) app that communicates via API to the backend in order to render the dashboard.

## Project Setup

Development requires [Node v18.19.1](https://nodejs.org/en) or higher is installed on your system. 

:::tip

When running locally (not with a devcontainer) you can use [nvm](https://github.com/nvm-sh/nvm) to manage the installed node version.

:::

Clone this repository somewhere and then install from the working directory

```shell
git clone https://github.com/FoxxMD/multi-scrobbler.git .
cd multi-scrobbler
nvm use # optional, sets correct node version when running without devcontainer
npm install
npm run start
```

### VSCode

This repository contains [workspace settings](https://github.com/FoxxMD/multi-scrobbler/blob/master/.devcontainer) for development with VSCode. These include:

* Run/Debug [Launch configurations](https://code.visualstudio.com/Docs/editor/debugging#_launch-configurations) for the application and tests
* [Devcontainer](https://code.visualstudio.com/docs/devcontainers/containers) for development with all dependencies already installed
* Useful extensions for linting and running tests

To use the Devcontainer simple open the repository in VSCode and "Use Devcontainer" when the notification is presented. `npm install` will be run when a new container is created.

## Common Development

:::info

In this document, when referring to aspects of Sources and Clients that are shared between both, the Source/Client will be referred to as a **Component.**

:::

A Component is composed of two parts:

* Typescript interfaces describing structure of configuration for that Component
* A concrete class inheriting from a common "startup" abstract class that enforces how the Component is built and operates

In both parts Source/Clients share some common properties/behavior before diverging in how they operate.

### Config

The configuration for a Component should always have this minimum shape, enforced respectively by the interfaces [CommonSourceConfig](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/common/infrastructure/config/source/index.ts#L105) and [CommonClientConfig](https://github.com/FoxxMD/multi-scrobbler/blob/ce1c70a4e1e87fb5bea7cca960eaafbd15881a1f/src/backend/common/infrastructure/config/client/index.ts#L68):

```ts
interface MyConfig {
  name: string
  data?: object
  options?: object
}
```

* `data` contains data that is required for a Component to operate such as credentials, callback urls, api keys, endpoints, etc...
* `options` are **optional** settings that can be used to fine-tune the usage of the Component but are not required or do not majorly affect behavior. EX additional logging toggles

### Concrete Class

Components inherit from an abstract base class, [`AbstractComponent`](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/common/AbstractComponent.ts), that defines different "stages" of how a Component is built and initialized when MS first starts as well as when restarting the Component in the event it stops due to an error/network failure/etc...

#### Stages

Stages below are invoked in the order listed. All stages are asynchronous to allow fetching network requests or reading files.

The stage function (described in each stage below) should return a value or throw:

* return `null` if the stage is not required
* return `true` if the stage succeeded
* return a `string` if the stage succeeded and you wish to append a result to the log output for this stage
* throw an `Exception` if the stage failed for any reason and the Component should not continue to run/start up

##### Stage: Build Data

This stage should be used to validate user configuration, parse any additional data from async sources (file, network), and finalize the shape of any configuration/data needed for the Component to operate.

:::info

Implement [`doBuildInitData`](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/common/AbstractComponent.ts#L71) in your child class to invoke this stage.

::::

<details>

<summary>Examples</summary>

* Parse a full URL like `http://SOME_IP:7000/subfolder/api` from user config containing a base url like `data.baseUrl: 'SOME_IP'` and then store this in the class config
* Validate that config `data` contains required properties `user` `password` `salt`
* Read stored credentials from `${this.configDir}/currentCreds-MySource-${name}.json`;

</details>

##### Stage: Check Connection

This stage is used to validate that MS can communicate with the service the Component is interacting with. This stage is invoked on MS startup as well as any time the Component tries to restart after a failure.

If the Component depends on **ingress** (like Jellyfin/Plex webhook) this stage is not necessary.

:::info

Implement [`doCheckConnection`](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/common/AbstractComponent.ts#L103) in your child class to invoke this stage.

::::

<details>

<summary>Examples</summary>

* Make a [`request`](https://nodejs.org/docs/latest-v18.x/api/http.html#httprequesturl-options-callback) to the service's server to ensure it is accessible
* Open a websocket connection and check for a ping-pong

</details>

##### Stage: Test Auth

MS determines if Auth is required for a Component based on two class properties. You should set these properties during `constructor` initialization for your Component class:

* `requiresAuth` - (default `false`) Set to `true` if MS should check/test Auth for this Component
* `requiresAuthInteraction` - (default `false`) Set to `true` if user interaction is required to complete auth IE user needs to visit a callback URL

If the Component requires authentication in order to communicate with a service then any required data should be built in this stage and a request made to the service to ensure the authentication data is valid.

This stage should return:

* `true` if auth succeeded
* `false` if auth failed without unexpected errors 
  * IE the authentication data is not valid and requires user interaction to resolve the failure
* throw an exception if network failure or unexpected error occurred

You _should_ attempt to re-authenticate, if possible. Only throw an exception or return `false` if there is no way to recover from an authentication failure.

:::info

Implement [`doAuthentication`](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/common/AbstractComponent.ts#L111) in your child class to invoke this stage.

::::

<details>

<summary>Examples</summary>

* Generate a Bearer Token for Basic Auth from user/password given in config and store in class properties
* Make a request to a known endpoint with Authorization token from read credentials file to see if succeeds or returns 403
* Catch a 403 and attempt to reauthenticate at an auth endpoint with user/password given in config

</details>

### Play Object

The **PlayObject** is the standard data structure MS uses to store listen (track) information and data required for scrobbling. It consists of:

* Track Data -- a standard format for storing track, artists, album, track duration, the date the track was played at, etc...
* Listen Metadata -- Optional but useful data related to the specific play or specifics about the Source/Client context for this play such as
  * Platform specific ID, web URL to track, device/user ID that played this track, etc...

Both Sources and Clients use the **PlayObject** interface. When a Component receives track info from its corresponding service it must transform this data into a PlayObject before it can be interacted with.

For more refer to the TS documentation for `PlayObject` or [`AmbPlayObject`](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/core/Atomic.ts#L141) in your project

## Creating Clients and Sources

* [Source Development and Tutorial](dev-source.md)
* [Client Development and Tutorial](dev-client.md)

## Profiling

Run tsx with inspect args

```
NODE_ENV=production node node_modules/.bin/tsx --inspect --heap-prof src/backend/index.ts
```

Use `chrome://inspect` from a chromium-based browser and attach to the running process, usually `localhost:9229`

From the opened DevTools window use Performance or Memory to profile the running process.