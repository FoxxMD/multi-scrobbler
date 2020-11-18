# multi-scrobbler

[![Latest Release](https://img.shields.io/github/v/release/foxxmd/multi-scrobbler)](https://github.com/FoxxMD/multi-scrobbler/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker Pulls](https://img.shields.io/docker/pulls/foxxmd/multi-scrobbler)](https://hub.docker.com/repository/docker/foxxmd/multi-scrobbler)

A single-user, javascript app to scrobble your recent plays to [Maloja](https://github.com/krateng/maloja) (and other clients, eventually)

* Displays running status and buffered log through web server
* Spotify - Authorize your app through the web server
* Spotify - Persists obtained credentials to file
* Spotify - Automatically refreshes authorization for unattended use
* Spotify - Implements back off behavior if no listening activity is detected after an interval (after 10 minutes of idle it will back off to a maximum of 5 minutes between checks)
* [Tautulli](https://tautulli.com/) - Scrobble endpoint using notification webhook

## Installation


### Locally

Clone this repository somewhere and then install from the working directory

```bash
npm install
```

### [Dockerhub](https://hub.docker.com/repository/docker/foxxmd/multi-scrobbler)

```
foxxmd/multi-scrobbler:latest
```

## Setup

All configuration is done through json files or environment variables. Reference the [examples in the config folder](https://github.com/FoxxMD/multi-scrobbler/tree/master/config) more detailed explanations and structure.

**A property from a json config will override the corresponding environmental variable.**

### App (General)

[JSON config example](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/config.json.example)

These environmental variables do not have a config file equivalent (to make Docker configuration easier)

| Environmental Variable | Required? |   Default    |                                        Description                                        |
|----------------------------|-----------|--------------|-------------------------------------------------------------------------------------------|
| `CONFIG_DIR`               |         - | `CWD/config` | Directory to look for all other configuration files                                       |
| `LOG_PATH`                 |         - | `CWD/logs`   | If `false` no logs will be written. If `string` will be the directory logs are written to |
| `PORT`                     |         - | 9078         | Port to run web server on                                                                 |

**The app must have permission to write to `CONFIG_DIR` in order to store the current spotify access token.**


### Sources (Where Music Plays Come From)

#### Spotify

To access your Spotify history you must [register an application](https://developer.spotify.com/dashboard) to get a Client ID/Secret. Make sure to also whitelist your redirect URI in the application settings.

[Spotify config example](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/spotify.json.example)

All variables have a config file equivalent which will overwrite the ENV variable if present (so config file is not required if ENVs present)

| Environmental Variable     | Required? |            Default             |                    Description                     |
|----------------------------|-----------|----------------------------------|----------------------------------------------------|
| `SPOTIFY_CLIENT_ID`        | Yes       |                                  |                                                    |
| `SPOTIFY_CLIENT_SECRET`    | Yes       |                                  |                                                    |
| `SPOTIFY_ACCESS_TOKEN`     | -         |                                  | Must include either this token or client id/secret |
| `SPOTIFY_REFRESH_TOKEN`    | -         |                                  |                                                    |
| `SPOTIFY_REDIRECT_URI`     | -         | `http://localhost:{PORT}/callback` | URI must end in `callback`                         |

The app will automatically obtain new access/refresh token if needed and possible. These will override values from configuration.

#### [Tautulli](https://tautulli.com/)

No setup is required in the app. Check the [instructions](https://github.com/FoxxMD/multi-scrobbler/blob/master/docs/tautulli.md) on how to setup a notification agent to scrobble your plays.


### Scrobble Clients

At least one client (the only one right now...) must be setup in order for the app to work. Client configurations can alternatively be configured in the main [`config.json`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/config.json.example) configuration

#### Maloja

[Maloja config example](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/maloja.json.example)

All variables have a config file equivalent which will overwrite the ENV variable if present (so config file is not required if ENVs present)

| Environmental Variable | Required? | Default |          Description          |
|----------------------------|-----------|---------|-------------------------------|
| `MALOJA_URL`               | Yes       |         | Base URL of your installation |
| `MALOJA_API_KEY`           | Yes       |         | Api Key                       |

## Usage

Output is provided to stdout/stderr as well as file if specified in configuration.

On first startup you may need to authorize Spotify by visiting a callback URL. The default url to open is:

```
https://localhost:9078/authSpotify
```

Connection status and a buffered log of the last 50 events can be viewed at the root url: `https://localhost:9078`

### Running Directly

```
node index.js
```

### Docker

| Environmental Variable |  Type  |         Default         |
|------------------------|--------|-------------------------|
| `CONFIG_DIR`           | Volume | `/home/node/app/config` |
| `LOG_DIR`              | Volume | `/home/node/app/logs`   |
| `PORT`                 | Port   | 9078                    |

## Examples

[See minimal configuration in the examples doc](https://github.com/FoxxMD/multi-scrobbler/tree/master/docs/examples.md)

## License

MIT
