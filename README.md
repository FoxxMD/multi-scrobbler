# multi-scrobbler

[![Latest Release](https://img.shields.io/github/v/release/foxxmd/multi-scrobbler)](https://github.com/FoxxMD/multi-scrobbler/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker Pulls](https://img.shields.io/docker/pulls/foxxmd/multi-scrobbler)](https://hub.docker.com/r/foxxmd/multi-scrobbler)

A single-user, javascript app to scrobble your recent plays to [Maloja](https://github.com/krateng/maloja) (and other clients, eventually)

* Displays running status and buffered log through web server
* Spotify - Authorize your app through the web server
* Spotify - Persists obtained credentials to file
* Spotify - Automatically refreshes authorization for unattended use
* Spotify - Implements back off behavior if no listening activity is detected after an interval (after 10 minutes of idle it will back off to a maximum of 5 minutes between checks)
* [Tautulli](https://tautulli.com) - Scrobble endpoint using notification agents
* [Plex](https://plex.tv) - Scrobble endpoint using [Webhooks](https://support.plex.tv/articles/115002267687-webhooks)

## Installation And Running


### Locally

Clone this repository somewhere and then install from the working directory

```bash
git clone https://github.com/FoxxMD/multi-scrobbler.git .
cd multi-scrobbler
npm install
node index.js
```

### [Docker](https://hub.docker.com/r/foxxmd/multi-scrobbler)

```
docker run foxxmd/spotify-scrobbler:latest
```

## Setup

Some setup is required! See the [configuration](docs/configuration.md) docs for a full reference.

### TLDR, Minimal Example

You want to use multi-scrobbler to scrobble your plays from Spotify to Maloja:

#### Local
```
SPOTIFY_CLIENT_ID=yourId SPOTIFY_CLIENT_SECRET=yourSecret MALOJA_URL=http://domain.tld MALOJA_API_KEY=1234 node index.js
```

#### Docker

```
docker run -e "SPOTIFY_CLIENT_ID=yourId" -e "SPOTIFY_CLIENT_SECRET=yourSecret" -e "MALOJA_URL=http://domain.tld" -e "MALOJA_API_KEY=1234" -v /path/on/host/config:/home/node/app/config foxxmd/spotify-scrobbler
```

**But I want to use json for configuration?**

Then use [config.json.example](/config/config.json.example) and drop it in your `CONFIG_DIR` directory

## Usage

A status page with statistics, recent logs, and some runtime configuration options can found at

```
https://localhost:9078
```
Output is also provided to stdout/stderr as well as file if specified in configuration.

On first startup you may need to authorize Spotify by visiting the callback URL (which can also be accessed from the status page). Visit the status page above to find the applicable link to trigger this.

## License

MIT
