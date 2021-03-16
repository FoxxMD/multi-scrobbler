# multi-scrobbler

[![Latest Release](https://img.shields.io/github/v/release/foxxmd/multi-scrobbler)](https://github.com/FoxxMD/multi-scrobbler/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker Pulls](https://img.shields.io/docker/pulls/foxxmd/multi-scrobbler)](https://hub.docker.com/r/foxxmd/multi-scrobbler)

A javascript app to scrobble plays from multiple sources to [Maloja](https://github.com/krateng/maloja), [Last.fm](https://www.last.fm), and other clients (eventually!)

* Supports scrobbling for many sources
  * [Spotify](/docs/configuration.md#spotify)
  * [Plex](/docs/configuration.md#plex) or [Tautulli](/docs/configuration.md#tautulli)
  * [Subsonic-compatible APIs](/docs/configuration.md#subsonic) (like [Airsonic](https://airsonic.github.io/))
  * [Jellyfin](/docs/configuration.md#jellyfin)
* Supports scrobbling to many clients
  * [Maloja](/docs/configuration.md#maloja)
  * [Last.fm](/docs/configuration.md#lastfm)
* Supports configuring for single or multiple users (scrobbling for your friends and family!)
* Web server interface for stats, basic control, and detailed logs
* Smart handling of credentials (persistent, authorization through app)
* Easy configuration through ENVs or JSON
* Built for Docker and unattended use!

**Why should I use this over a browser extension and/or mobile app scrobbler?**

* **Platform independent** -- Because multi-scrobbler communicates directly with service APIs it will scrobble everything you play regardless of where you play it. No more need for apps on every platform you use!
* **Open-source** -- Get peace of mind knowing exactly how your personal data is being handled.
* **Consolidate play sources** -- Scrobble from many sources to one client with ease and without duplicating tracks.
* **Manage scrobbling for others** -- Scrobble for your friends and family without any setup on their part. Easily silo sources to specific clients to keep plays separate.

## Installation


### Locally

Clone this repository somewhere and then install from the working directory

```bash
git clone https://github.com/FoxxMD/multi-scrobbler.git .
cd multi-scrobbler
npm install
```

### [Docker](https://hub.docker.com/r/foxxmd/multi-scrobbler)

```
foxxmd/multi-scrobbler:latest
```

## Setup

Some setup is required! See the [configuration](docs/configuration.md) docs for a full reference.

### TLDR, Minimal Example

You want to use multi-scrobbler to scrobble your plays from Spotify to Maloja:

#### Local
```bash
SPOTIFY_CLIENT_ID=yourId SPOTIFY_CLIENT_SECRET=yourSecret MALOJA_URL=http://domain.tld MALOJA_API_KEY=1234 node index.js
```

#### Docker

```bash
docker run -e "SPOTIFY_CLIENT_ID=yourId" -e "SPOTIFY_CLIENT_SECRET=yourSecret" -e "MALOJA_URL=http://domain.tld" -e "MALOJA_API_KEY=1234" -v /path/on/host/config:/home/node/app/config foxxmd/multi-scrobbler
```

**But I want to use json for configuration?**

Then use [config.json.example](/config/config.json.example) and drop it in your `CONFIG_DIR` directory

**Is there an example configuration using everything?**

Yes, check out the [kitchen sink example](/docs/kitchensink.md)

## Usage

A status page with statistics, recent logs, and some runtime configuration options can be found at

```
https://localhost:9078
```
Output is also provided to stdout/stderr as well as file if specified in configuration.

On first startup you may need to authorize Spotify by visiting the callback URL (which can also be accessed from the status page). Visit the status page above to find the applicable link to trigger this.

## License

MIT
