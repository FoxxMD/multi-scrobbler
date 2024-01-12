---
sidebar_position: 2
title: Overview
---

# Configuration

* [Overview](#overview)
  * [ENV-Based Configuration](#env-based-configuration)
  * [File-Based Configuration](#file-based-configuration)
    * [All-in-One File Configuration](#all-in-one-file-configuration)
    * [Specific File Configuration](#specific-file-configuration)
* [Source Configurations](#source-configurations)
  * [Spotify](#spotify)
  * [Plex](#plex)
  * [Tautulli](#tautulli)
  * [Subsonic](#subsonic)
  * [Jellyfin](#jellyfin)
  * [Last.fm (Source)](#lastfm--source-)
  * [Listenbrainz (Source)](#listenbrainz--source-)
  * [Deezer](#deezer)
  * [Youtube Music](#youtube-music)
  * [MPRIS (Linux Desktop)](#mpris)
  * [Mopidy](#mopidy)
  * [JRiver](#jriver)
  * [Kodi](#kodi)
  * [WebScrobbler](#webscrobbler)
  * [Google Cast (Chromecast)](#google-cast--chromecast)
* [Client Configurations](#client-configurations)
  * [Maloja](#maloja)
  * [Last.fm](#lastfm)
  * [Listenbrainz](#listenbrainz)
* [Monitoring](#monitoring)
  * [Webhooks](#webhook-configurations)
  * [Health Endpoint](#health-endpoint)

# Overview

[**Sources** and **Clients**](/#how-does-multi-scrobbler-ms-work) are configured using environmental (ENV) variables and/or json files.

**MS will parse configuration from both configuration types.** You can mix and match configurations but it is generally better to stick to one or the other.

TIP: Check the [**FAQ**](../FAQ.md) if you have any issues after configuration!

## ENV-Based Configuration

This is done by passing environmental variables and so does not require any files to run MS.

* Using a docker container EX `docker run -e "SPOTIFY_CLIENT_ID=yourId" -e "SPOTIFY_CLIENT_SECRET=yourSecret" ...`
* Using a local installations by exporting variables before running MS EX `SPOTIFY_CLIENT_ID=yourId SPOTIFY_CLIENT_SECRET=yourSecret node index.js`

Use ENV-based configuration if:

* You are the only person for whom MS is scrobbling for
* You have a very simple setup for MS such as one scrobble [Client](/#client) and one [Source](/#source) IE Plex -> Maloja

## File-Based Configuration

MS will parse configuration files located in the directory specified by the `CONFIG_DIR` environmental variable. This variable defaults to:

* Local installation -> `PROJECT_DIR/config`
* Docker -> `/config` (in the container) -- see the [install docs](../installation/installation.md#docker) for how to configure this correctly

Use File-based configuration if:

* You have many [Sources](/#source)
* You have many of each type of **Source** you want to scrobble from IE 2x Plex accounts, 3x Spotify accounts, 1x
  Funkwhale...
* You have more than one scrobble **Client** you want to scrobble to IE multiple Maloja servers
* You want only some **Sources** to scrobble to some **Clients** IE Fred's Spotify account scrobbles to Fred's Maloja
    server, but not Mary's Maloja server

File-based configurations located in the `CONFIG_DIR` directory can be parsed from

* an **all-in-one** config file named `config.json` that contains information for all Sources and Clients and/or
* many **specific** files named based on the client/source to configure IE `plex.json` `spotify.json`

There are **example configurations** for all Source/Client types and AIO config located in the [/config](https://github.com/FoxxMD/multi-scrobbler/tree/master/config) directory of this project. These can be used as-is by renaming them to `.json`.
For docker installations these examples are copied to your configuration directory on first-time use.

There is also a [**kitchensink example**](kitchensink.md) that provides examples of using all sources/clients in a complex configuration.

### All-in-One File Configuration

[**Explore the schema for this configuration, along with an example generator and validator, here**](https://json-schema.app/view/%23?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Faio.json)

Example directory structure:

```
/CONFIG_DIR
  config.json
```

<details>
<summary>Config Example</summary>

```json5 title="config.json"
{
  //...
  "sources": [
    {
      "name": "myConfig",
      "type": "spotify",
      "clients": [
        "myMalojaClient"
      ],
      "data": {
        "clientId": "anExample"
        //...
      }
    }
  ],
  "clients": [
    {
      "name": "myFirstMalojaClient",
      "type": "maloja",
      "data": {
        "url": "http://myMalojaServer.example",
        // ...
      }
    }
  ]
}
```

</details>

`config.json` can also be used to set default behavior for all sources/clients using `sourceDefaults` and `clientDefaults` properties.

See [config.json.example](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/config.json.example) for an annotated example or check out [the kitchen sink example](kitchensink.md).

### Specific File Configuration

Each file is named by the **type** of the Client/Source found in below sections. Each file as an **array** of that type of Client/Source.

Example directory structure:

```
/CONFIG_DIR
  plex.json
  spotify.json
  maloja.json
```

<details>
<summary>Config Example</summary>

```json5
// in maloja.json
[
  {
    "name": "myFirstMalojaClient",
    "data": {
      "url": "http://myMalojaServer.example",
      "apiKey": "myKey"
    }
  },
  {
    "name": "mySecondMalojaClient",
    "data": {
      "url": "http://my2ndMalojaServer.example",
      "apiKey": "myKey"
    }
  }
]

```

</details>

See the [/config](https://github.com/FoxxMD/multi-scrobbler/blob/master/config) directory of this project for examples of each type of config file or reference specific files below.

# Application Options

These options affect multi-scrobbler's behavior and are not specific to any source/client.

#### Base URL

Defines the URL that is used to generate default redirect URLs for authentication on [spotify](#spotify), [lastfm](#lastfm), and [deezer](#deezer) -- as well as some logging hints.

* Default => `http://localhost`
* Set with [ENV](#env-based-configuration) `BASE_URL` or `baseUrl` [all-in-one configuration](#all-in-one-file-configuration)

EX: Lastfm Redirect Url is `BASE_URL:PORT/lastfm/callback` -- Set `BASE_URL=http://192.168.0.101` => Redirect URL is `http://192.168.0.101:9078/lastfm/callback` (when no other redirectUri is specified for [lastfm configuration](#lastfm))

Useful when running with [docker](../installation/installation.md#docker) so that you do not need to specify redirect URLs for each configuration.

# Source Configurations

## [Spotify](https://www.spotify.com)

To access your Spotify history you must [register an application](https://developer.spotify.com/dashboard) to get a
Client ID/Secret. Make sure to also whitelist your redirect URI in the application settings.

**NOTE:** If your Spotify player has [Automix](https://community.spotify.com/t5/FAQs/What-is-Automix/ta-p/5257278) enabled and Spotify uses it for your playlist/queue then MS cannot accurately determine when a track will end. This is because the track is "mixed" in your queue with a shorter play time than its actual length and [Spotify does not report this modified play time in its API.](https://community.spotify.com/t5/Spotify-for-Developers/Wrong-duration-ms-of-track-with-Automix/m-p/5429147) This **does not affect MS's ability to scrobble** from Spotify but it will affect the accuracy of the duration MS reports was played.

### ENV-Based

| Environmental Variable     | Required? | Default                          |                    Description                     |
|----------------------------|-----------|----------------------------------|----------------------------------------------------|
| `SPOTIFY_CLIENT_ID`        | Yes       |                                  |                                                    |
| `SPOTIFY_CLIENT_SECRET`    | Yes       |                                  |                                                    |
| `SPOTIFY_REDIRECT_URI`     | No         | `http://localhost:9078/callback` | URI must end in `callback`                         |

### File-Based

See [`spotify.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/spotify.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FSpotifySourceConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fsource.json)

## [Plex](https://plex.tv)

Check the [instructions](plex.md) on how to setup a [webhooks](https://support.plex.tv/articles/115002267687-webhooks) to scrobble your plays.

### ENV-Based

| Environmental Variable | Required | Default |                   Description                   |
|------------------------|----------|---------|-------------------------------------------------|
| `PLEX_USER`              |        No |         | The a comma-delimited list of usernames to scrobble tracks for. No usernames specified means all tracks by all users will be scrobbled. |

### File-Based

See [`plex.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/plex.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FPlexSourceConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fsource.json)

## [Tautulli](https://tautulli.com)

Check the [instructions](plex.md) on how to setup a notification agent.

### ENV-Based

| Environmental Variable | Required | Default |                   Description                   |
|------------------------|----------|---------|-------------------------------------------------|
| `TAUTULLI_USER`              |        No |         | The a comma-delimited list of usernames to scrobble tracks for. No usernames specified means all tracks by all users will be scrobbled. |

### File-Based

See [`tautulli.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/tautulli.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FTautulliSourceConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fsource.json)

## [Subsonic](http://www.subsonic.org/)

Can use this source for any application that implements the [Subsonic API](http://www.subsonic.org/pages/api.jsp) and supports the [`getNowPlaying`](http://www.subsonic.org/pages/api.jsp#getNowPlaying) endpoint (such as [Airsonic](https://airsonic.github.io/) and [Navidrome](https://www.navidrome.org/))

**Known Issues:**
* "Time played at" is somewhat inaccurate since the api only reports "played X minutes ago" so...
  * All scrobble times are therefore "on the minute" and you may experience occasional duplicate scrobbles
  * "played X minutes ago" sometimes is also not reported correctly
* Multiple artists are reported as one value and cannot be separated
* If using [Airsonic Advanced](https://github.com/airsonic-advanced/airsonic-advanced) the password used (under **Credentials**) must be **Decodable**  

### ENV-Based

| Environmental Variable     | Required? |            Default             |                    Description                     |
|----------------------------|-----------|----------------------------------|----------------------------------------------------|
| `SUBSONIC_USER`        | Yes       |                                  |                                                    |
| `SUBSONIC_PASSWORD`    | Yes       |                                  |                                                    |
| `SUBSONIC_URL`     | Yes         |                                  | Base url of your subsonic-api server |

### File-Based

See [`subsonic.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/subsonic.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FSubSonicSourceConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fsource.json)

## [Jellyfin](https://jellyfin.org/)

Must be using Jellyfin 10.7 or greater

* In the Jellyfin desktop web UI Navigate to -> Administration -> Dashboard -> Plugins -> Catalog
  * Under Notifications -> **Webhook** -> Install, then restart your server
* Navigate back to -> Administration -> Dashboard -> Plugins -> My Plugins -> Webhook
  * Click "..." -> Settings
* In Webhook settings:
  * `Add Generic Destination`
  * In the new `Generic` dropdown:
    * Webhook Url: `http://localhost:9078/jellyfin`
    * Notification Type: `Playback Progress`
    * Item Type: `Songs`
    * Check `Send All Properties`
  * Save

If you see errors in the MS logs regarding `missing headers` when using Jellyfin [see this workaround.](../FAQ.md#jellyfin-has-warnings-about-missing-headers)

### ENV-Based

| Environmental Variable | Required? | Default | Description                                                       |
|------------------------|-----------|---------|-------------------------------------------------------------------|
| `JELLYFIN_USER`        |           |         | Comma-separated list of usernames (from Jellyfin) to scrobble for |
| `JELLYFIN_SERVER`      |           |         | Comma-separated list of Jellyfin server names to scrobble from    |

### File-Based

See [`jellyfin.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/jellyfin.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FJellySourceConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fsource.json)

## [Last.fm (Source)](https://www.last.fm)

See the [Last.fm (Client)](#lastfm) setup for registration instructions.

### ENV-Based

No support for ENV based for Last.fm as a client (only source)

### File-Based

See [`lastfm.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/lastfm.json.example), change `configureAs` to `source`. Or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FLastfmSourceConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fsource.json)

## [Listenbrainz (Source)](https://listenbrainz.org)

You will need to run your own Listenbrainz server or have an account [on the official instance](https://listenbrainz.org/login/)

On your [profile page](https://listenbrainz.org/profile/) find your **User Token** to use in the configuration.

**NOTE:** You cannot use ENV variables shown in the [Listenbrainz Client config](#listenbrainz) -- multi-scrobbler assumes Listenbrainz ENVs are always used for the **client** configuration. You must use the file-based config from below to setup Listenbrainz as a Source.

### File-Based

See [`listenbrainz.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/listenbrainz.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23%2Fdefinitions%2FListenBrainzSourceConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fsource.json)

**Change `configureAs` to `source`**

## [Deezer](https://deezer.com/)

Create a new application at [Deezer Developers](https://developers.deezer.com/myapps)

* Application Domain must be the same as your multi-scrobbler domain. Default is `localhost:9078`
* Redirect URL must end in `deezer/callback`
  * Default would be `http://localhost:9078/deezer/callback`

After application creation you should have credentials displayed in the "My Apps" dashboard. You will need:

* **Application ID**
* **Secret Key**
* **Redirect URL** (if not the default)

**If no access token is provided...**

After starting multi-scrobbler with credentials in-place open the dashboard (`http://localhost:9078`) and find your Deezer source. Click **(Re)authenticate and (re)start polling** to start the login process. After login is complete polling will begin automatically.

### ENV-Based

| Environmental Variable     | Required? | Default                                 |                    Description                     |
|----------------------------|-----------|-----------------------------------------|----------------------------------------------------|
| `DEEZER_CLIENT_ID`        | Yes       |                                         |  Your **Application ID**                            |
| `DEEZER_CLIENT_SECRET`    | Yes       |                                         |  Your **Secret Key**                                |
| `DEEZER_REDIRECT_URI`     | No         | `http://localhost:9078/deezer/callback` | URI must end in `deezer/callback`         |

### File-Based

See [`deezer.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/deezer.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FDeezerSourceConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fsource.json)

## [Youtube Music](https://music.youtube.com)

Credentials for YT Music are obtained from a browser request to https://music.youtube.com **once you are logged in.** [Specific requirements are here and summarized below:](https://github.com/nickp10/youtube-music-ts-api/blob/master/DOCUMENTATION.md#authenticate)

* Open a new tab
* Open the developer tools (Ctrl-Shift-I) and select the “Network” tab 
* Go to https://music.youtube.com and ensure you are logged in 

Then...

1. Find and select an authenticated POST request. The simplest way is to filter by /browse using the search bar of the developer tools. If you don’t see the request, try scrolling down a bit or clicking on the library button in the top bar.
2. **Make sure **Headers** pane is selected and open
3. In the **Request Headers** section find and copy the **entire value** found after `Cookie:` and use this as the `cookie` value in your multi-scrobbler config
4. If present, in the **Request Headers** section find and copy the number found in `X-google-AuthUser` and use this as the value for `authUser` in your multi-scrobbler config

![Google Headers](google-header.jpg)

NOTES:

* YT Music authentication is "browser based" which means your credentials may expire after a (long?) period of time OR if you log out of https://music.youtube.com. In the event this happens just repeat the steps above to get new credentials.
* Communication to YT Music is **unofficial** and not supported or endorsed by Google. This means that **this integration may stop working at any time** if Google decides to change how YT Music works in the browser.

### File-Based

See [`ytmusic.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/ytmusic.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FYTMusicSourceConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fsource.json)

## [MPRIS](https://specifications.freedesktop.org/mpris-spec/latest/)

MPRIS is a standard interface for communicating with Music Players on **linux operating systems.**

If you run Linux and have a notification tray that shows what media you are listening to, you likely have access to MPRIS.

![Notification Tray](mpris.jpg)

multi-scrobbler can listen to this interface and scrobble tracks played by **any media player** that communicates to the operating system with MPRIS.

**NOTE:** multi-scrobbler needs to be running as a [**Local Installation**](../installation/installation.md#local) in order to use MPRIS. This cannot be used from docker.

### ENV-Based

| Environmental Variable | Required? | Default | Description                                                                      |
|------------------------|-----------|---------|----------------------------------------------------------------------------------|
| MPRIS_ENABLE           | No        |         | Use MPRIS as a Source (useful when you don't need any other options)             |
| MPRIS_BLACKLIST        | No        |         | Comma-delimited list of player names not to scrobble from                        |
| MPRIS_WHITELIST        | No        |         | Comma-delimited list of players names to ONLY scrobble from. Overrides blacklist |

### File-Based

See [`mpris.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/mpris.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23%2Fdefinitions%2FMPRISSourceConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fsource.json)

## [Mopidy](https://mopidy.com/)

Mopidy is a headless music server that supports playing music from many [standard and non-standard sources such as Pandora, Bandcamp, and Tunein.](https://mopidy.com/ext/)

multi-scrobbler can scrobble tracks played from any Mopidy backend source, regardless of where you listen to them.

### File-Based

See [`mopidy.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/mopidy.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23%2Fdefinitions%2FMopidySourceConfig/%23%2Fdefinitions%2FMopidyData?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fsource.json)

Configuration Options:

##### `url`

The URL used to connect to the Mopidy server. You MUST have [Mopidy-HTTP extension](https://mopidy.com/ext/http) enabled.

If no `url` is provided a default is used which assumes Mopidy is installed on the same server as multi-scrobbler: `ws://localhost:6680/mopidy/ws/`

Make sure the hostname and port number match what is found in the Mopidy configuration file `mopidy.conf`:

```
...

[http]
hostname = localhost
port = 6680

...
```

The URL used to connect ultimately must be formed like this: `[protocol]://[hostname]:[port]/[path]`
If any part of this URL is missing multi-scrobbler will use a default value, for your convenience. This also means that if any part of your URL is **not** standard you must explicitly define it.

Part => Default Value

* Protocol => `ws://`
* Hostname => `localhost`
* Port => `6680`
* Path => `/mopidy/ws/`

<details>
<summary>URL Transform Examples</summary>

```json
{
  "url": "mopidy.mydomain.com"
}
```

MS transforms this to: `ws://mopidy.mydomain.com:6680/mopidy/ws/`

```json
{
  "url": "192.168.0.101:3456"
}
```

MS transforms this to: `ws://192.168.0.101:3456/mopidy/ws/`

```json
{
  "url": "mopidy.mydomain.com:80/MOPWS"
}
```

MS transforms this to: `ws://mopidy.mydomain.com:80/MOPWS`

</details>


#### URI Blacklist/Whitelist

If you wish to disallow or only allow scrobbling from some sources played through Mopidy you can specify these using `uriBlacklist` or `uriWhitelist` in your config. multi-scrobbler will check the list to see if any string matches the START of the `uri` on a track. If whitelist is used then blacklist is ignored. All strings are case-insensitive.

EX:

```json
{
  "uriBlacklist": ["soundcloud"]
}
```

Will prevent multi-scrobbler from scrobbling any Mopidy track that start with a `uri` like `soundcloud:song:MySong-1234`

#### Album Blacklist

For certain sources (Soundcloud) Mopidy does not have all track info (Album) and will instead use "Soundcloud" as the Album name. You can prevent multi-scrobbler from using this bad Album data by adding the fake Album name to this list. Multi-scrobbler will still scrobble the track, just without the bad data. All strings are case-insensitive.

EX:

```json
{
  "albumBlacklist": ["SoundCloud", "Mixcloud"]
}
```

If a track would be scrobbled like `Album: Soundcloud, Track: My Cool Track, Artist: A Cool Artist` 
then multi-scrobbler will instead scrobble  `Track: My Cool Track, Artist: A Cool Artist`

## [JRiver](https://jriver.com/)

In order for multi-scrobbler to communicate with JRiver you must have [Web Server Interface](https://wiki.jriver.com/index.php/Web_Service_Interface#Documentation_of_Functions) enabled. This can can be in the JRiver GUI:

* Tools -> Options -> Media Network
  * Check `Use Media Network to share this library...`
  * If you have `Authentication` checked you will need to provide the **Username** and **Password** in the ENV/File configuration below.

#### URL

If you do not provide a URL then a default is used which assumes JRiver is installed on the same server as multi-scrobbler: `http://localhost:52199/MCWS/v1/`

* Make sure the port number matches what is found in `Advanced` section in the [Media Network](#jriver) options.
* If your installation is on the same machine but you cannot connect using `localhost` try `0.0.0.0` instead.

The URL used to connect ultimately must be formed like this: `[protocol]://[hostname]:[port]/[path]`
If any part of this URL is missing multi-scrobbler will use a default value, for your convenience. This also means that if any part of your URL is **not** standard you must explicitly define it.

Part => Default Value

* Protocol => `http://`
* Hostname => `localhost`
* Port => `52199`
* Path => `/MCWS/v1/`

<details>
<summary>URL Transform Examples</summary>

```json
{
  "url": "jriver.mydomain.com"
}
```

MS transforms this to: `http://jriver.mydomain.com:52199/MCWS/v1/`

```json
{
  "url": "192.168.0.101:3456"
}
```

MS transforms this to: `http://192.168.0.101:3456/MCWS/v1/`

```json
{
  "url": "mydomain.com:80/jriverReverse/MCWS/v1/"
}
```

MS transforms this to: `http://mydomain.com:80/jriverReverse/MCWS/v1/`

</details>

### ENV-Based


| Environmental Variable | Required |             Default             |                  Description                   |
|------------------------|----------|---------------------------------|------------------------------------------------|
| JRIVER_URL             | Yes      | http://localhost:52199/MCWS/v1/ | The URL of the JRiver server                   |
| JRIVER_USERNAME        | No       |                                 | If authentication is enabled, the username set |
| JRIVER_PASSWORD        | No       |                                 | If authenticated is enabled, the password set  |


### File-Based

See [`jriver.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/jriver.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23%2Fdefinitions%2FJRiverSourceConfig/%23%2Fdefinitions%2FJRiverData?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fsource.json)

## [Kodi](https://kodi.tv/)

In order for multi-scrobbler to communicate with Kodi you must have the [Web Interface](https://kodi.wiki/view/Web_interface) enabled. This can can be in the Kodi GUI:

* Settings -> Services -> Control
  * Check `Allow remote control via HTTP`
  * Ensure you have a **Username** and **Password** set, you will need to provide them in the ENV/File configuration below.

#### URL

If you do not provide a URL then a default is used which assumes Kodi is installed on the same server as multi-scrobbler: `http://localhost:8080/jsonrpc`

* Make sure the port number matches what is found in **Port** in the [Control](#kodi) section mentioned above.
* If your installation is on the same machine but you cannot connect using `localhost` try `0.0.0.0` instead.

The URL used to connect ultimately must be formed like this: `[protocol]://[hostname]:[port]/[path]`
If any part of this URL is missing multi-scrobbler will use a default value, for your convenience. This also means that if any part of your URL is **not** standard you must explicitly define it.

Part => Default Value

* Protocol => `http://`
* Hostname => `localhost`
* Port => `8080`
* Path => `/jsonrpc`

<details>
<summary>URL Transform Examples</summary>

```json
{
  "url": "kodi.mydomain.com"
}
```

MS transforms this to: `http://kodi.mydomain.com:8080/jsonrpc`

```json
{
  "url": "192.168.0.101:3456"
}
```

MS transforms this to: `http://192.168.0.101:3456/jsonprc`

```json
{
  "url": "mydomain.com:80/kodiReverse/jsonrpc"
}
```

MS transforms this to: `http://mydomain.com:80/kodiReverse/jsonrpc`

</details>

### ENV-Based


| Environmental Variable | Required | Default                       | Description                |
|------------------------|----------|-------------------------------|----------------------------|
| KODI_URL               | Yes      | http://localhost:8080/jsonrpc | The URL of the Kodi server |
| KODI_USERNAME          | No       |                               | The username set           |
| KODI_PASSWORD          | No       |                               | The password set           |


### File-Based

See [`kodi.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/kodi.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23%2Fdefinitions%2FKodiSourceConfig/%23%2Fdefinitions%2FKodiData?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fsource.json)

## [WebScrobbler](https://web-scrobbler.com/)

After installing the extension open the preferences/settings for it:

* Under **Accounts**
  * **Add Webhook**
    * API URL: `http://localhost:9078/api/webscrobbler`
    * Application name: `(whatever you want)`

Reload the extension after adding the webhook.

* **On Firefox** - Only FQNs (domain.tld), `localhost`, and `127.0.0.1` are supported for API URL due to [firefox requiring https](https://github.com/web-scrobbler/web-scrobbler/issues/4183#issuecomment-1749222006)
* **On Chromium-based Browsers** - Any domain will work for API URL
* All Other browsers are untested

#### Multiple Users

If you would like use multiple WebScrobbler sources they can be matched using a **slug** at the end of the **API URL.** This requires using [a file-based config.](#file-based-configuration)

Example:

In `webscrobbler.json`

```json
[
  {
    "name": "aUserWS",
    "clients": [
      "client1Maloja"
    ],
    "data": {
      "slug": "usera" 
    }
  },
  {
    "name": "bUserWS",
    "clients": [
      "client2Maloja"
    ],
    "data": {
      "slug": "userb"
    }
  }
]
```

* To use `aUserWS` source set **API URL** to `http://localhost:9078/api/webscrobbler/usera`
* To use `bUserWS` source set **API URL** to `http://localhost:9078/api/webscrobbler/userb`

Note: `http://localhost:9078/api/webscrobbler` is matched with the first source that _that does not have a slug defined._

##### Connectors Black/Whitelist

MS can be configured to only scrobble, or NOT scrobble, from some WS connectors. Use the name of the website from the [supported websites](https://web-scrobbler.com/) or from the **Connectors** tab in the extension. Note that this **only** affects MS's behavior and does not affect the general connector behavior you have configured within the WebScrobbler extension.

### ENV-Based

| Environmental Variable | Required? | Default | Description                                                              |
|------------------------|-----------|---------|--------------------------------------------------------------------------|
| WS_ENABLE              | No        |         | Set to 'true' to enable WS without needing to define other ENVs          |
| WS_WHITELIST           | No        |         | Only scrobble from these WebScrobbler Connectors. Comma-delimited list   |
| WS_BLACKLIST           | No        |         | Do not scrobble from these WebScrobbler Connectors. Comma-delimited list |

### File-Based

See [`webscrobbler.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/webscrobbler.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23%2Fdefinitions%2FWebScrobblerSourceConfig/%23%2Fdefinitions%2FWebScrobblerData?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fsource.json)

## [Google Cast (Chromecast)](https://www.google.com/chromecast/built-in/)

If your media device can be **Cast** to using this button ![Chromecast Icon](https://upload.wikimedia.org/wikipedia/commons/2/26/Chromecast_cast_button_icon.svg) on your phone/computer then multi-scrobbler can monitor it in order to scrobble music you play.

**Note:** This source relies on common, **basic** music data provided by the cast device which will always be less exhaustive than data parsed from full source integrations. If there is an existing [Source](#source-configurations) it is recommended to configure for it and blacklist the app on Google Cast, rather than relying solely on Google Cast for scrobbling.

#### Networking Requirements

The host machine running multi-scrobbler must be configured to allow [mDNS traffic on port 5353/UDP](https://book.hacktricks.xyz/network-services-pentesting/5353-udp-multicast-dns-mdns).

##### Linux

**Docker**

The host machine must have [avahi-daemon](https://avahi.org/) running to circumvent limitations with DNS resolution due to musl in Alpine. All major linux distributions package avahi and many have it built-in. Once avahi is running you must pass D-Bus and the avahi daemon socket to your container like so:

```
docker run ... -v /var/run/dbus:/var/run/dbus -v  	/var/run/avahi-daemon/socket:/var/run/avahi-daemon/socket ... foxxmd/multi-scrobbler
```

**Flatpak**

No additional steps are required.

##### Windows

**Docker**

Unsupported at this time.

#### Cast Troubleshooting

Please include any/all logs with raw output if there are any errors encountered as this is critical to diagnosing issues.

To diagnose bad/incomplete track information or strange MS player behavior please turn on **payload logging** and include log output of the source running to help diagnose this issue:

```json5
// in chromecast.json or config.json sources
[
  {
    "name": "MyCast",
    "type": "chromecast",
    "data": {
      //...
    },
    "options": {
      "logPayload": true
    }
  }
]
```

### ENV-Based

| Environmental Variable | Required? | Default |                                     Description                                      |
|------------------------|-----------|---------|--------------------------------------------------------------------------------------|
| CC_ENABLE              | No        |         | Set to 'true' to enable Cast monitoring without needing to define other ENVs         |
| CC_WHITELIST_DEVICES   | No        |         | Only scrobble from these Cast devices. Comma-delimited list. EX mini-home, family-tv |
| CC_BLACKLIST_DEVICES   | No        |         | Do not scrobble from these Cast devices. Comma-delimited list                        |
| CC_WHITELIST_APPS      | No        |         | Only scrobble from these casted Apps. Comma-delimited list. EX spotify, pandora      |
| CC_BLACKLIST_APPS      | No        |         | Do not scrobble from these casted Apps. Comma-delimited list                         |

### File-Based

See [`chromecast.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/webscrobbler.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23%2Fdefinitions%2FChromecastSourceConfig/%23%2Fdefinitions%2FChromecastData?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fsource.json)

# Client Configurations

## [Maloja](https://github.com/krateng/maloja)

### ENV-Based

| Environmental Variable | Required? | Default |          Description          |
|----------------------------|-----------|---------|-------------------------------|
| `MALOJA_URL`               | Yes       |         | Base URL of your installation |
| `MALOJA_API_KEY`           | Yes       |         | Api Key                       |

### File-Based

See [`maloja.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/maloja.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FMalojaClientConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fclient.json)

## [Last.fm](https://www.last.fm)

[Register for an API account here.](https://www.last.fm/api/account/create)

The Callback URL is actually specified by multi-scrobbler but to keep things consistent you should use
```
http://localhost:9078/lastfm/callback
```
or replace `localhost:9078` with your own base URL

### ENV-Based

| Environmental Variable | Required? | Default                                 |          Description          |
|----------------------------|-----------|-----------------------------------------|-------------------------------|
| `LASTFM_API_KEY`           | Yes       |                                         | Api Key from your API Account |
| `LASTFM_SECRET`            | Yes       |                                         | Shared secret from your API Account |
| `LASTFM_REDIRECT_URI`      | No        | `http://localhost:9078/lastfm/callback` | Url to use for authentication. Must include `lastfm/callback` somewhere in it |
| `LASTFM_SESSION`           | No        |                                         | Session id. Will be generated by authentication flow if not provided.                       |

### File-Based

See [`lastfm.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/lastfm.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FLastfmClientConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fclient.json)

## [Listenbrainz](https://listenbrainz.org)

You will need to run your own Listenbrainz server or have an account [on the official instance](https://listenbrainz.org/login/)

On your [profile page](https://listenbrainz.org/profile/) find your **User Token** to use in the configuration.

### ENV-Based


| Environmental Variable | Required? |            Default            |           Description           |
|------------------------|-----------|-------------------------------|---------------------------------|
| LZ_TOKEN               | Yes       |                               | User token from your LZ profile |
| LZ_USER                | Yes       |                               | Your LZ username                |
| LZ_URL                 | No        | https://api.listenbrainz.org/ | The base URL for the LZ server  |

### File-Based

See [`listenbrainz.json.example`](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/listenbrainz.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23%2Fdefinitions%2FListenBrainzClientConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fclient.json)

# Monitoring

multi-scrobbler supports some common webhooks and a healthcheck endpoint in order to monitor Sources and Clients for errors.

## Webhook Configurations

Webhooks will **push** a notification to your configured servers on these events:

* Source polling started 
* Source polling retry
* Source polling stopped on error 
* Scrobble client scrobble failure

Webhooks are configured in the main [config.json](#all-in-one-file-configuration) file under the `webhook` top-level property. Multiple webhooks may be configured for each webhook type. EX:

```json5
{
  "sources": [
    //...
  ],
  "clients": [
    //...
  ],
  "webhooks": [
    {
      "name": "FirstGotifyServer",
      "type": "gotify",
      "url": "http://192.168.0.100:8070",
      "token": "abcd"
    }, 
    {
      "name": "SecondGotifyServer",
      "type": "gotify",
      //...
    },
    {
      "name": "NtfyServerOne",
      "type": "ntfy",
      //...
    },
    //...
  ]
}
```

### [Gotify](https://gotify.net/)

Refer to the [config schema for GotifyConfig](https://json-schema.app/view/%23/%23%2Fdefinitions%2FGotifyConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Faio.json)

multi-scrobbler optionally supports setting message notification priority via `info` `warn` and `error` mappings.

EX

```json
{
  "type": "gotify",
  "name": "MyGotifyFriendlyNameForLogs",
  "url": "http://192.168.0.100:8070",
  "token": "AQZI58fA.rfSZbm",
  "priorities": {
    "info": 5,
    "warn": 7,
    "error": 10
  }
}
```

### [Ntfy](https://ntfy.sh/)

Refer to the [config schema for NtfyConfig](https://json-schema.app/view/%23/%23%2Fdefinitions%2FNtfyConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Faio.json)

multi-scrobbler optionally supports setting message notification priority via `info` `warn` and `error` mappings.

EX

```json
{
  "type": "ntfy",
  "name": "MyNtfyFriendlyNameForLogs",
  "url": "http://192.168.0.100:9991",
  "topic": "RvOwKJ1XtIVMXGLR",
  "username": "Optional",
  "password": "Optional",
  "priorities": {
    "info": 3,
    "warn": 4,
    "error": 5
  }
}
```

## Health Endpoint

An endpoint for monitoring the health of sources/clients is available at GET `http://YourMultiScrobblerDomain/health`

* Returns `200 OK` when **everything** is working or `500 Internal Server Error` if **anything** is not 
* The plain url (`/health`) aggregates status of **all clients/sources** -- so any failing client/source will make status return 500 
  * Use query params `type` or `name` to restrict client/sources aggregated IE `/health?type=spotify` or `/health?name=MyMaloja`
* On 500 the response returns a JSON payload with `messages` array that describes any issues
  * For any clients/sources that require authentication `/health` will return 500 if they are **not authenticated** 
  * For sources that poll (spotify, yt music, subsonic) `/health` will 500 if they are **not polling**
