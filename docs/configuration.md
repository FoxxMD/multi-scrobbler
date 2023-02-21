* [Configuration Overview](#configuration-overview)
  * [ENV-Based Configuration](#env-based-configuration)
  * [File-Based Configuration](#file-based-configuration)
    * [All-in-One File Configuration](#all-in-one-file-configuration)
    * [Specific File Configuration](#specific-file-configuration)
* [Source Configurations](#source-configurations)
  * [Spotify](#spotify)
    * [ENV-Based](#env-based)
    * [File-Based](#file-based)
  * [Plex](#plex)
    * [ENV-Based](#env-based-1)
    * [File-Based](#file-based-1)
  * [Tautulli](#tautulli)
    * [ENV-Based](#env-based-2)
    * [File-Based](#file-based-2)
  * [Subsonic](#subsonic)
    * [ENV-Based](#env-based-3)
    * [File-Based](#file-based-3)
  * [Jellyfin](#jellyfin)
    * [ENV-Based](#env-based-4)
    * [File-Based](#file-based-4)
  * [Last.fm (Source)](#lastfm--source-)
    * [ENV-Based](#env-based-5)
    * [File-Based](#file-based-5)
  * [Deezer](#deezer)
    * [ENV-Based](#env-based-6)
    * [File-Based](#file-based-6)
* [Client Configurations](#client-configurations)
  * [Maloja](#maloja)
    * [ENV-Based](#env-based-7)
    * [File-Based](#file-based-7)
  * [Last.fm](#lastfm)
    * [ENV-Based](#env-based-8)
    * [File-Based](#file-based-8)

# Configuration Overview

[**Sources** and **Clients**](/README.md#how-does-multi-scrobbler-ms-work) are configured using environmental (ENV) variables and/or json files.

**MS will parse configuration from both configuration types.** You can mix and match configurations but it is generally better to stick to one or the other.

## ENV-Based Configuration

This is done by passing environmental variables and so does not require any files to run MS.

* Using a docker container EX `docker run -e "SPOTIFY_CLIENT_ID=yourId" -e "SPOTIFY_CLIENT_SECRET=yourSecret" ...`
* Using a local installations by exporting variables before running MS EX `SPOTIFY_CLIENT_ID=yourId SPOTIFY_CLIENT_SECRET=yourSecret node index.js`

Use ENV-based configuration if:

* You are the only person for whom MS is scrobbling for
* You have a very simple setup for MS such as one scrobble [Client](/README.md#client) and one [Source](/README.md#source) IE Plex -> Maloja

## File-Based Configuration

MS will parse configuration files located in the directory specified by the `CONFIG_DIR` environmental variable. This variable defaults to:

* Local installation -> `PROJECT_DIR/config`
* Docker -> `/config` (in the container) -- see the [install docs](/docs/installation.md#docker) for how to configure this correctly

Use File-based configuration if:

* You have many [Sources](/README.md#source)
* You have many of each type of **Source** you want to scrobble from IE 2x Plex accounts, 3x Spotify accounts, 1x
  Funkwhale...
* You have more than one scrobble **Client** you want to scrobble to IE multiple Maloja servers
* You want only some **Sources** to scrobble to some **Clients** IE Fred's Spotify account scrobbles to Fred's Maloja
    server, but not Mary's Maloja server

File-based configurations located in the `CONFIG_DIR` directory can be parsed from

* an **all-in-one** config file named `config.json` that contains information for all Sources and Clients and/or
* many **specific** files named based on the client/source to configure IE `plex.json` `spotify.json`

There are **example configurations** for all Source/Client types and AIO config located in the [/config](/config) directory of this project. These can be used as-is by renaming them to `.json`.
For docker installations these examples are copied to your configuration directory on first-time use.

There is also a [**kitchensink example**](/docs/kitchensink.md) that provides examples of using all sources/clients in a complex configuration.

### All-in-One File Configuration

[**Explore the schema for this configuration, along with an example generator and validator, here**](https://json-schema.app/view/%23?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fdevelop%2Fsrc%2Fcommon%2Fschema%2Faio.json)

Example directory structure:

```
/CONFIG_DIR
  config.json
```

<details>
<summary>Config Example</summary>

```json5
// in config.json
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

See [config.json.example](/config/config.json.example) for an annotated example or check out [the kitchen sink example](kitchensink.md).

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

See the [/config](/config) directory of this project for examples of each type of config file or reference specific files below.

# Source Configurations

## [Spotify](https://www.spotify.com)

To access your Spotify history you must [register an application](https://developer.spotify.com/dashboard) to get a
Client ID/Secret. Make sure to also whitelist your redirect URI in the application settings.

### ENV-Based

| Environmental Variable     | Required? | Default                          |                    Description                     |
|----------------------------|-----------|----------------------------------|----------------------------------------------------|
| `SPOTIFY_CLIENT_ID`        | Yes       |                                  |                                                    |
| `SPOTIFY_CLIENT_SECRET`    | Yes       |                                  |                                                    |
| `SPOTIFY_REDIRECT_URI`     | No         | `http://localhost:9078/callback` | URI must end in `callback`                         |

### File-Based

See [`spotify.json.example`](/config/spotify.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FSpotifySourceConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fdevelop%2Fsrc%2Fcommon%2Fschema%2Fsource.json)

## [Plex](https://plex.tv)

Check the [instructions](plex.md) on how to setup a [webhooks](https://support.plex.tv/articles/115002267687-webhooks) to scrobble your plays.

### ENV-Based

| Environmental Variable | Required | Default |                   Description                   |
|------------------------|----------|---------|-------------------------------------------------|
| `PLEX_USER`              |        No |         | The a comma-delimited list of usernames to scrobble tracks for. No usernames specified means all tracks by all users will be scrobbled. |

### File-Based

See [`plex.json.example`](/config/plex.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FPlexSourceConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fdevelop%2Fsrc%2Fcommon%2Fschema%2Fsource.json)

## [Tautulli](https://tautulli.com)

Check the [instructions](plex.md) on how to setup a notification agent.

### ENV-Based

| Environmental Variable | Required | Default |                   Description                   |
|------------------------|----------|---------|-------------------------------------------------|
| `TAUTULLI_USER`              |        No |         | The a comma-delimited list of usernames to scrobble tracks for. No usernames specified means all tracks by all users will be scrobbled. |

### File-Based

See [`tautulli.json.example`](/config/tautulli.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FTautulliSourceConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fdevelop%2Fsrc%2Fcommon%2Fschema%2Fsource.json)

## [Subsonic](http://www.subsonic.org/)

Can use this source for any application that implements the [Subsonic API](http://www.subsonic.org/pages/api.jsp) (such as [Airsonic](https://airsonic.github.io/))

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

See [`subsonic.json.example`](/config/subsonic.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FSubSonicSourceConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fdevelop%2Fsrc%2Fcommon%2Fschema%2Fsource.json)

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

### ENV-Based

| Environmental Variable | Required? | Default | Description                                                       |
|------------------------|-----------|---------|-------------------------------------------------------------------|
| `JELLYFIN_USER`        |           |         | Comma-separated list of usernames (from Jellyfin) to scrobble for |
| `JELLYFIN_SERVER`      |           |         | Comma-separated list of Jellyfin server names to scrobble from    |

### File-Based

See [`jellyfin.json.example`](/config/jellyfin.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FJellySourceConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fdevelop%2Fsrc%2Fcommon%2Fschema%2Fsource.json)

## [Last.fm (Source)](https://www.last.fm)

See the [Last.fm (Client)](#lastfm) setup for registration instructions.

### ENV-Based

No support for ENV based for Last.fm as a client (only source)

### File-Based

See [`lastfm.json.example`](/config/lastfm.json.example), change `configureAs` to `source`. Or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FLastfmSourceConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fdevelop%2Fsrc%2Fcommon%2Fschema%2Fsource.json)

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

See [`deezer.json.example`](/config/deezer.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FDeezerSourceConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fdevelop%2Fsrc%2Fcommon%2Fschema%2Fsource.json)

# Client Configurations

## [Maloja](https://github.com/krateng/maloja)

### ENV-Based

| Environmental Variable | Required? | Default |          Description          |
|----------------------------|-----------|---------|-------------------------------|
| `MALOJA_URL`               | Yes       |         | Base URL of your installation |
| `MALOJA_API_KEY`           | Yes       |         | Api Key                       |

### File-Based

See [`maloja.json.example`](/config/maloja.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FMalojaClientConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fdevelop%2Fsrc%2Fcommon%2Fschema%2Fclient.json)

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

See [`lastfm.json.example`](/config/lastfm.json.example) or [explore the schema with an example and live editor/validator](https://json-schema.app/view/%23/%23%2Fdefinitions%2FLastfmClientConfig?url=https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fdevelop%2Fsrc%2Fcommon%2Fschema%2Fclient.json)
