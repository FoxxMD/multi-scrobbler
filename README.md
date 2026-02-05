# multi-scrobbler

[![Latest Release](https://img.shields.io/github/v/release/foxxmd/multi-scrobbler)](https://github.com/FoxxMD/multi-scrobbler/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker Pulls](https://img.shields.io/docker/pulls/foxxmd/multi-scrobbler)](https://hub.docker.com/r/foxxmd/multi-scrobbler)
[![Docs](https://img.shields.io/badge/Read%20The%20Docs-1082c2)](https://foxxmd.github.io/multi-scrobbler/)


<img src="/assets/icon.png" align="right"
alt="multi-scrobbler logo" width="180" height="180">

A dockerized app that monitors your music listening activity from *everywhere* and scrobbles it *anywhere*.

* Supports scrobbling from many [**Sources**](https://foxxmd.github.io/multi-scrobbler/configuration/sources)
    * [Azuracast](https://foxxmd.github.io/multi-scrobbler/configuration/sources/azuracast)
    * [Deezer](https://foxxmd.github.io/multi-scrobbler/configuration/sources/deezer)
    * [Google Cast (Chromecast)](https://foxxmd.github.io/multi-scrobbler/configuration/sources/google-cast)
    * [Icecast](https://foxxmd.github.io/multi-scrobbler/configuration/sources/icecast)
    * [Jellyfin](https://foxxmd.github.io/multi-scrobbler/configuration/sources/jellyfin)
    * [JRiver](https://foxxmd.github.io/multi-scrobbler/configuration/sources/jriver)
    * [Kodi](https://foxxmd.github.io/multi-scrobbler/configuration/sources/kodi)
    * [Koito](https://foxxmd.github.io/multi-scrobbler/configuration/sources/koito-source)
    * [Last.fm](https://foxxmd.github.io/multi-scrobbler/configuration/sources/lastfm-source)
    * [Last.fm (Endpoint)](https://foxxmd.github.io/multi-scrobbler/configuration/sources/lastfm-endpoint)
    * [Libre.fm](https://foxxmd.github.io/multi-scrobbler/configuration/sources/librefm-source)
    * [ListenBrainz](https://foxxmd.github.io/multi-scrobbler/configuration/sources/listenbrainz-source)
    * [ListenBrainz (Endpoint)](https://foxxmd.github.io/multi-scrobbler/configuration/sources/listenbrainz-endpoint)
    * [Maloja](https://foxxmd.github.io/multi-scrobbler/configuration/sources/maloja)
    * [Mopidy](https://foxxmd.github.io/multi-scrobbler/configuration/sources/mopidy)
    * [MPD (Music Player Daemon)](https://foxxmd.github.io/multi-scrobbler/configuration/sources/mpd)
    * [MPRIS (Linux Desktop)](https://foxxmd.github.io/multi-scrobbler/configuration/sources/mpris)
    * [Musikcube](https://foxxmd.github.io/multi-scrobbler/configuration/sources/musikcube)
    * [Plex](https://foxxmd.github.io/multi-scrobbler/configuration/sources/plex)
    * [Rocksky](https://foxxmd.github.io/multi-scrobbler/configuration/sources/rocksky-source)
    * [Sonos](https://foxxmd.github.io/multi-scrobbler/configuration/sources/sonos)
    * [Spotify](https://foxxmd.github.io/multi-scrobbler/configuration/sources/spotify)
    * [Subsonic-compatible APIs](https://foxxmd.github.io/multi-scrobbler/configuration/sources/subsonic) (like [Airsonic](https://airsonic.github.io/) and [Navidrome](https://www.navidrome.org/))
    * [teal.fm](https://foxxmd.github.io/multi-scrobbler/configuration/sources/tealfm-source)
    * [WebScrobbler](https://foxxmd.github.io/multi-scrobbler/configuration/sources/webscrobbler)
    * [VLC](https://foxxmd.github.io/multi-scrobbler/configuration/sources/vlc)
    * [Yamaha MusicCast](https://foxxmd.github.io/multi-scrobbler/configuration/sources/yamaha-musiccast)
    * [Youtube Music](https://foxxmd.github.io/multi-scrobbler/configuration/sources/youtube-music)
* Supports scrobbling to many [**Clients**](https://foxxmd.github.io/multi-scrobbler/configuration/clients)
    * [Koito](https://foxxmd.github.io/multi-scrobbler/configuration/clients/koito)
    * [Last.fm](https://foxxmd.github.io/multi-scrobbler/configuration/clients/lastfm)
    * [Libre.fm](https://foxxmd.github.io/multi-scrobbler/configuration/clients/librefm)
    * [ListenBrainz](https://foxxmd.github.io/multi-scrobbler/configuration/clients/listenbrainz)
    * [Maloja](https://foxxmd.github.io/multi-scrobbler/configuration/clients/maloja)
    * [Rocksky](https://foxxmd.github.io/multi-scrobbler/configuration/clients/rocksky)
    * [teal.fm](https://foxxmd.github.io/multi-scrobbler/configuration/clients/tealfm)
* Monitor status of Sources and Clients using [webhooks (Gotify, Ntfy, Apprise)](https://foxxmd.github.io/multi-scrobbler/configuration#webhook-configurations), [healthcheck endpoints](https://foxxmd.github.io/multi-scrobbler/configuration#health-endpoint), or [prometheus metrics](https://foxxmd.github.io/multi-scrobbler/configuration/#prometheus).
* Supports [Now Playing](https://foxxmd.github.io/multi-scrobbler/configuration/clients#now-playing) for scrobble Clients
* Supports configuring for single or multiple users (scrobbling for your friends and family!)
* Web server interface for stats, basic control, and detailed logs
* Graceful network and client failure handling (queued scrobbles that auto-retry)
* Smart handling of credentials (persistent, authorization through app)
* Easy configuration through [ENVs or JSON](ttps://foxxmd.github.io/multi-scrobbler/configuration#configuration-types)
* Modify data before scrobbling with [regular expression or search patterns](https://foxxmd.github.io/multi-scrobbler/configuration/transforms)
* Install using [Docker images for x86/ARM](https://foxxmd.github.io/multi-scrobbler/installation#docker) or [locally with NodeJS](https://foxxmd.github.io/multi-scrobbler/installation#nodejs)

[**Quick Start Guide**](https://foxxmd.github.io/multi-scrobbler//quickstart)

<img src="/docsite/static/img/status-ui.png" width="800">

**Why should I use this over a browser extension and/or mobile app scrobbler?**

* **Platform independent** -- Because multi-scrobbler communicates directly with service APIs it will scrobble everything you play regardless of where you play it. No more need for apps on every platform you use!
* **Open-source** -- Get peace of mind knowing exactly how your personal data is being handled.
* **Track your activity regardless of where you listen** -- Scrobble from many Sources to one Client with ease and without duplicating tracks.
* **Manage scrobbling for others** -- Scrobble for your friends and family without any setup on their part. Easily silo sources to specific clients to keep plays separate.

**But I already scrobble my music to Last.fm/ListenBrainz, is multi-scrobbler for me?**

Yes! You can use [Last.fm as a **Source**](https://foxxmd.github.io/multi-scrobbler/configuration/sources/lastfm-source) or [Listenbrainz as a **Source**](https://foxxmd.github.io/multi-scrobbler/configuration/sources/listenbrainz-source) to forward scrobbles from your profile to any other Client! That way you can keep your current scrobble setup as-is but still get the benefit of capturing your data to a self-hosted location.

## How Does multi-scrobbler (MS) Work?

You set up [configurations](https://foxxmd.github.io/multi-scrobbler/configuration) for one or more [**Sources**](https://foxxmd.github.io/multi-scrobbler/configuration/sources) and one or more [**Clients**](https://foxxmd.github.io/multi-scrobbler/configuration/clients). MS monitors all of your configured **Sources**. When new tracks are played by a Source MS grabs that information and then sends it (scrobbles it) to all **Clients** that Source is configured to forward to.

### Source

A [**Source**](https://foxxmd.github.io/multi-scrobbler/configuration/sources) is a data source that contains information about music you are playing or have listened to, such as: a desktop player, web music player, or cloud music service. Examples are **Spotify, Jellyfin, Plex, Youtube Music, Navidrome**, etc...

Source configurations consist of:

* A friendly name.
* Any data needed to communicate or authenticate with the Source.
* An optional list of Client names that the Source should scrobble to. If omitted the Source also scrobbles to all configured Clients.

### Client

A [**Client**](https://foxxmd.github.io/multi-scrobbler/configuration/clients) is an application that stores the historical information about what music you have played (scrobbles). Examples are **Koito, Last.fm, Listenbrainz**...

Client configurations consist of:

* A friendly name.
* Any data needed to communicate or authenticate with the Client.

## Quick Start

[See the **Quick Start Guide**](https://foxxmd.github.io/multi-scrobbler/quickstart)

## Installation

[See the **Installation** documentation](https://foxxmd.github.io/multi-scrobbler/installation)

## Configuration

[See the **Configuration** documentation](https://foxxmd.github.io/multi-scrobbler/configuration)

## Usage

A status page with statistics, recent logs, and some runtime configuration options can be found at

```
http://localhost:9078
```
Output is also provided to stdout/stderr as well as file if specified in configuration.

On first startup you may need to authorize Spotify and/or Last.fm by visiting the callback URL (which can also be accessed from the status page). Visit the status page above to find the applicable link to trigger this.

## Help/FAQ

Having issues with connections or configuration? Check the [FAQ](https://foxxmd.github.io/multi-scrobbler/FAQ) before creating an issue!

## Development

[Detailed architecture and development guides for Sources/Clients](https://foxxmd.github.io/multi-scrobbler/development/dev-common)

## License

MIT
