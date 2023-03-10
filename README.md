# multi-scrobbler

[![Latest Release](https://img.shields.io/github/v/release/foxxmd/multi-scrobbler)](https://github.com/FoxxMD/multi-scrobbler/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker Pulls](https://img.shields.io/docker/pulls/foxxmd/multi-scrobbler)](https://hub.docker.com/r/foxxmd/multi-scrobbler)

A javascript app to scrobble plays from multiple sources to [Maloja](https://github.com/krateng/maloja), [Last.fm](https://www.last.fm), and other clients

* Supports scrobbling for many sources
  * [Spotify](/docs/configuration.md#spotify)
  * [Plex](/docs/configuration.md#plex) or [Tautulli](/docs/configuration.md#tautulli)
  * [Subsonic-compatible APIs](/docs/configuration.md#subsonic) (like [Airsonic](https://airsonic.github.io/))
  * [Jellyfin](/docs/configuration.md#jellyfin)
  * [Youtube Music](/docs/configuration.md#youtube-music)
  * [Last.fm](/docs/configuration.md#lastfm-source)
  * [Deezer](/docs/configuration.md#deezer)
  * [MPRIS (Linux Desktop)](/docs/configuration.md#mpris)
  * [Mopidy](/docs/configuration.md#mopidy)
* Supports scrobbling to many clients
  * [Maloja](/docs/configuration.md#maloja)
  * [Last.fm](/docs/configuration.md#lastfm)
  * [Listenbrainz](/docs/configuration.md#listenbrainz)
* Monitor status of sources and clients using [webhooks (Gotify or Ntfy)](/docs/configuration.md#webhook-configurations) or [healthcheck endpoint](/docs/configuration.md#health-endpoint)
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

Yes! You can use [Last.fm as a **Source**](/docs/configuration.md#lastfm--source-) to mirror scrobbles from your Last.fm profile to Maloja. That way you can keep your current scrobble setup as-is but still get the benefit of capturing your data to a self-hosted location.

<img src="/assets/status-ui.jpg" width="800">

## How Does multi-scrobbler (MS) Work?

You set up configurations for one or more **Sources** and one or more **Clients**. MS monitors all of your configured **Sources**. When new tracks are played by a Source it grabs that information and then sends it (scrobbles it) to all **Clients** that Source is configured to scrobble to.

### Source

A **Source** is a data source that contains information about tracks you are playing like a music player or platform. Examples are **Spotify, Jellyfin, Plex, Airsonic**, etc...

Source configurations consist of:

* A friendly name.
* Any data needed to communicate or authenticate with the Source.
* An optional list of Client names that the Source should scrobble to. If omitted the Source also scrobbles to all configured Clients.

### Client

A **Client** is an application that stores the historical information about what songs you have played (scrobbles). Examples are **Maloja, Last.fm, Listenbrainz**...

Client configurations consist of:

* A friendly name.
* Any data needed to communicate or authenticate with the Client.

## Installation

[See the **Installation** documentation](/docs/installation.md)

## Configuration

[See the **Configuration** documentation](/docs/configuration.md)

## Usage

A status page with statistics, recent logs, and some runtime configuration options can be found at

```
http://localhost:9078
```
Output is also provided to stdout/stderr as well as file if specified in configuration.

On first startup you may need to authorize Spotify and/or Last.fm by visiting the callback URL (which can also be accessed from the status page). Visit the status page above to find the applicable link to trigger this.

## Help/FAQ

Having issues with connections or configuration? Check the [FAQ](/docs/FAQ.md) before creating an issue!

## License

MIT
