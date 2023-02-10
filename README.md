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
  * [Last.fm](/docs/configuration.md#lastfm-source)
  * [Deezer](/docs/configuration.md#deezer)
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

**But I already scrobble my music to Last.fm, is multi-scrobbler for me?**

Yes! You can use [Last.fm as a Source](/docs/configuration.md#lastfm-source) to mirror scrobbles from your Last.fm profile to Maloja. That way you can keep your current scrobble setup as-is but still get the benefit of capturing your data to a self-hosted location.

<img src="/assets/status-ui.jpg" width="800">

## Installation


### Locally

Clone this repository somewhere and then install from the working directory

```bash
git clone https://github.com/FoxxMD/multi-scrobbler.git .
cd multi-scrobbler
npm install
npm build
npm start
```

### [Docker](https://hub.docker.com/r/foxxmd/multi-scrobbler)

```
foxxmd/multi-scrobbler:latest
```

Or use the provided [docker-compose.yml](/docker-compose.yml) after modifying it to fit your configuration.

## Setup

Some setup is required! See the [configuration](docs/configuration.md) docs for a full reference.

**Is there an example configuration using everything?**

Yes, check out the [kitchen sink example](/docs/kitchensink.md)

#### Local Example
```bash
SPOTIFY_CLIENT_ID=yourId SPOTIFY_CLIENT_SECRET=yourSecret MALOJA_URL=http://domain.tld MALOJA_API_KEY=1234 node index.js
```

**But I want to use json for configuration?**

Rename [config.json.example](/config/config.json.example) to `config.json` and modify as necessary.

#### Docker

Recommended configuration steps for docker or docker-compose usage:

* If using json configuration you must **bind the host directory where your configurations are located into the container:**
  * [Using `-v` method for docker](https://docs.docker.com/storage/bind-mounts/#start-a-container-with-a-bind-mount): `-v /path/on/host/config:/config`
  * [Using docker-compose](https://docs.docker.com/compose/compose-file/compose-file-v3/#short-syntax-3): `- /path/on/host/config:/config`
* (Optionally) map the web UI port in the container **9078** to the host
  * With [docker](https://docs.docker.com/engine/reference/commandline/run/#publish): `-p 9078:9078` (first port is the port on the host to use)
  * With [docker-compose](https://docs.docker.com/compose/compose-file/compose-file-v3/#short-syntax-1): `- "9078:9078"`
* (Optionally) set the [timezone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) for the container using the environmental variable `TZ` ([docker](https://docs.docker.com/engine/reference/commandline/run/#env)) ([docker-compose](https://docs.docker.com/compose/compose-file/compose-file-v3/#environment))

##### Linux Host

If you are

* using [rootless containers with Podman](https://developers.redhat.com/blog/2020/09/25/rootless-containers-with-podman-the-basics#why_podman_)
* running docker on MacOS or Windows

this **DOES NOT** apply to you.

If you are running Docker on a **Linux Host** you must specify `user:group` permissions of the user who owns the **configuration directory** on the host to avoid [docker file permission problems.](https://ikriv.com/blog/?p=4698) These can be specified using the [environmental variables **PUID** and **PGID**.](https://docs.linuxserver.io/general/understanding-puid-and-pgid)

To get the UID and GID for the current user run these commands from a terminal:

* `id -u` -- prints UID
* `id -g` -- prints GID

##### Examples

```bash
docker run -e "SPOTIFY_CLIENT_ID=yourId" -e "SPOTIFY_CLIENT_SECRET=yourSecret" -e "MALOJA_URL=http://domain.tld" -e "MALOJA_API_KEY=1234" -e "PUID=1000" -e "PGID=1000" -p 9078:9078 -v /path/on/host/config:/home/node/app/config foxxmd/multi-scrobbler
```

See the [docker-compose.yml](/docker-compose.yml) file for how to use with docker-compose.

## Usage

A status page with statistics, recent logs, and some runtime configuration options can be found at

```
http://localhost:9078
```
Output is also provided to stdout/stderr as well as file if specified in configuration.

On first startup you may need to authorize Spotify by visiting the callback URL (which can also be accessed from the status page). Visit the status page above to find the applicable link to trigger this.

## License

MIT
