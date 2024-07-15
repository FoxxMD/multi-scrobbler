# multi-scrobbler

[![Latest Release](https://img.shields.io/github/v/release/foxxmd/multi-scrobbler)](https://github.com/FoxxMD/multi-scrobbler/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker Pulls](https://img.shields.io/docker/pulls/foxxmd/multi-scrobbler)](https://hub.docker.com/r/foxxmd/multi-scrobbler)
[![Docs](https://img.shields.io/badge/Read%20The%20Docs-1082c2)](https://foxxmd.github.io/multi-scrobbler/)


<img src="/assets/icon.png" align="right"
alt="multi-scrobbler logo" width="180" height="180">

A javascript app to scrobble music you listened to, to [Maloja](https://github.com/krateng/maloja), [Last.fm](https://www.last.fm), and [ListenBrainz](https://listenbrainz.org)

* Supports scrobbling from many **Sources**
  * [Spotify](/docsite/docs/configuration/configuration.md#spotify)
  * [Plex](/docsite/docs/configuration/configuration.md#plex) or [Tautulli](/docsite/docs/configuration/configuration.md#tautulli)
  * [Subsonic-compatible APIs](/docsite/docs/configuration/configuration.md#subsonic) (like [Airsonic](https://airsonic.github.io/) and [Navidrome](https://www.navidrome.org/))
  * [Jellyfin](/docsite/docs/configuration/configuration.md#jellyfin)
  * [WebScrobbler](/docsite/docs/configuration/configuration.md#webscrobbler)
  * [Youtube Music](/docsite/docs/configuration/configuration.md#youtube-music)
  * [Last.fm](/docsite/docs/configuration/configuration.md#lastfm-source)
  * [ListenBrainz](/docsite/docs/configuration/configuration.md#listenbrainz--source-)
  * [Deezer](/docsite/docs/configuration/configuration.md#deezer)
  * [MPRIS (Linux Desktop)](/docsite/docs/configuration/configuration.md#mpris)
  * [Mopidy](/docsite/docs/configuration/configuration.md#mopidy)
  * [JRiver](/docsite/docs/configuration/configuration.md#jriver)
  * [Kodi](/docsite/docs/configuration/configuration.md#kodi)
  * [Google Cast (Chromecast)](/docsite/docs/configuration/configuration.md#google-cast--chromecast-)
  * [Musikcube](/docsite/docs/configuration/configuration.md#muikcube)
* Supports scrobbling to many **Clients**
  * [Maloja](/docsite/docs/configuration/configuration.md#maloja)
  * [Last.fm](/docsite/docs/configuration/configuration.md#lastfm)
  * [ListenBrainz](/docsite/docs/configuration/configuration.md#listenbrainz)
* Monitor status of Sources and Clients using [webhooks (Gotify, Ntfy, Apprise)](/docsite/docs/configuration/configuration.md#webhook-configurations) or [healthcheck endpoint](/docsite/docs/configuration/configuration.md#health-endpoint)
* Supports configuring for single or multiple users (scrobbling for your friends and family!)
* Web server interface for stats, basic control, and detailed logs
* Graceful network and client failure handling (queued scrobbles that auto-retry)
* Smart handling of credentials (persistent, authorization through app)
* Easy configuration through ENVs or JSON
* Install using [Docker images for x86/ARM](/docsite/docs/installation/installation.md#docker), [flatpak](/docsite/docs/installation/installation.md#flatpak), or [locally with NodeJS](/docsite/docs/installation/installation.md#nodejs)

[**Read The Docs to get started**](https://foxxmd.github.io/multi-scrobbler/docs/installation)

<img src="/assets/status-ui.png" width="800">

**Why should I use this over a browser extension and/or mobile app scrobbler?**

* **Platform independent** -- Because multi-scrobbler communicates directly with service APIs it will scrobble everything you play regardless of where you play it. No more need for apps on every platform you use!
* **Open-source** -- Get peace of mind knowing exactly how your personal data is being handled.
* **Track your activity regardless of where you listen** -- Scrobble from many Sources to one Client with ease and without duplicating tracks.
* **Manage scrobbling for others** -- Scrobble for your friends and family without any setup on their part. Easily silo sources to specific clients to keep plays separate.

**But I already scrobble my music to Last.fm/ListenBrainz, is multi-scrobbler for me?**

Yes! You can use [Last.fm as a **Source**](/docsite/docs/configuration/configuration.md#lastfm-source) or [Listenbrainz as a **Source**](/docsite/docs/configuration/configuration.md#listenbrainz-source) to forward scrobbles from your profile to any other Client! That way you can keep your current scrobble setup as-is but still get the benefit of capturing your data to a self-hosted location.

## How Does multi-scrobbler (MS) Work?

You set up configurations for one or more **Sources** and one or more **Clients**. MS monitors all of your configured **Sources**. When new tracks are played by a Source it grabs that information and then sends it (scrobbles it) to all **Clients** that Source is configured to scrobble to.

### Source

A **Source** is a data source that contains information about tracks you are playing like a music player or platform. Examples are **Spotify, Jellyfin, Plex, Youtube Music, Airsonic**, etc...

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

[See the **Installation** documentation](/docsite/docs/installation/installation.md)

## Configuration

[See the **Configuration** documentation](/docsite/docs/configuration/configuration.md)

## Usage

A status page with statistics, recent logs, and some runtime configuration options can be found at

```
http://localhost:9078
```
Output is also provided to stdout/stderr as well as file if specified in configuration.

On first startup you may need to authorize Spotify and/or Last.fm by visiting the callback URL (which can also be accessed from the status page). Visit the status page above to find the applicable link to trigger this.

## Help/FAQ

Having issues with connections or configuration? Check the [FAQ](/docsite/docs/FAQ.md) before creating an issue!

## Development

[Detailed architecture and development guides for Sources/Clients](/docsite/docs/development/dev-common.md)

## License

MIT
