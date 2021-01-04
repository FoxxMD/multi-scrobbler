# General

General configuration options. These must be set through environmental variables because they affect initial startup of
the app. **These variables are also available to Docker containers.**

| Environmental Variable | Required? |   Default    |                                        Description                                        |
|----------------------------|-----------|--------------|-------------------------------------------------------------------------------------------|
| `CONFIG_DIR`               |         No | `CWD/config` | Directory to look for all other configuration files                                       |
| `LOG_PATH`                 |         No | `CWD/logs`   | If `false` no logs will be written. If `string` will be the directory logs are written to |
| `PORT`                     |         No | 9078         | Port to run web server on                                                                 |

**The app must have permission to write to `CONFIG_DIR` in order to store the current spotify access token.**


# Sources and (Scrobble) Clients

The app has two types of configurations:

* **Sources** -- Where plays are parsed from
* **Clients** -- Scrobble clients that plays are scrobbled to

All configurations can be configured through:
* environmental variables
* individual **json** files for each source/client type found in the `CONFIG_DIR` directory IE `config/spotify.json`
* or through the main `config.json` (also found in `CONFIG_DIR` directory) using the `clients` or `sources` property under `data`:

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
  ]
}
```

See [config.json.example](../config/config.json.example) for a short example of this or check out [the kitchen sink example](kitchensink.md).

### ENV-Based or JSON-Based?

multi-scrobbler can be configured differently depending on how you will use it. See which use-case fits you the best and then use that approach when setting up each configuration:

#### ENV-Based (Single User)

* You are the only person for whom the application is scrobbling
* You may have many sources (Plex, Spotify, Tautulli...) but you only have one of each type of source
* You have only one scrobble client
* **Easier for small setups. Difficult for larger, multi-sourced setups (may want to switch to json)**
* **Will not work for multi-user setups**

#### JSON-Based (Multi User)

* You are a single user but want to set up many sources
* You want to use multi-scrobbler to scrobble for yourself and others IE family, friends, etc.
* You may have many of each type of **Source** you want to scrobble from IE 2x Plex accounts, 3x Spotify accounts, 1x
  Funkwhale...
* You have more than one scrobble **Client** you want to scrobble to IE multiple Maloja servers, one for each person
* You want only some **Sources** to scrobble to some **Clients** IE Fred's Spotify account scrobbles to Fred's Maloja
  server, but not Mary's Maloja server

Note: While you may mix and match configuration approaches it is recommended to **only use ENV-based configs if you are
doing everything in ENV-based configurations.**

# Sources

## [Spotify](https://www.spotify.com)

To access your Spotify history you must [register an application](https://developer.spotify.com/dashboard) to get a
Client ID/Secret. Make sure to also whitelist your redirect URI in the application settings.

### ENV-Based

| Environmental Variable     | Required? |            Default             |                    Description                     |
|----------------------------|-----------|----------------------------------|----------------------------------------------------|
| `SPOTIFY_CLIENT_ID`        | Yes       |                                  |                                                    |
| `SPOTIFY_CLIENT_SECRET`    | Yes       |                                  |                                                    |
| `SPOTIFY_ACCESS_TOKEN`     | No         |                                  | Must include either this token or client id/secret |
| `SPOTIFY_REFRESH_TOKEN`    | No         |                                  | If using access token this is also recommended      |
| `SPOTIFY_REDIRECT_URI`     | No         | `http://localhost:{PORT}/callback` | URI must end in `callback`                         |

### JSON-Based

See [`spotify.json.example`](../config/spotify.json.example)

## [Plex](https://plex.tv)

Check the [instructions](plex.md) on how to setup a [webhooks](https://support.plex.tv/articles/115002267687-webhooks) to scrobble your plays.

### ENV-Based

| Environmental Variable | Required | Default |                   Description                   |
|------------------------|----------|---------|-------------------------------------------------|
| `PLEX_USER`              |        No |         | The a comma-delimited list of usernames to scrobble tracks for. No usernames specified means all tracks by all users will be scrobbled. |

### JSON-Based

See [`plex.json.example`](../config/plex.json.example)

## [Tautulli](https://tautulli.com)

Check the [instructions](plex.md) on how to setup a notification agent.

### ENV-Based

| Environmental Variable | Required | Default |                   Description                   |
|------------------------|----------|---------|-------------------------------------------------|
| `TAUTULLI_USER`              |        No |         | The a comma-delimited list of usernames to scrobble tracks for. No usernames specified means all tracks by all users will be scrobbled. |

### JSON-Based

See [`tautulli.json.example`](../config/tautulli.json.example)

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

### JSON-Based

See [`subsonic.json.example`](../config/subsonic.json.example)

# Clients

## [Maloja](https://github.com/krateng/maloja)

### ENV-Based

| Environmental Variable | Required? | Default |          Description          |
|----------------------------|-----------|---------|-------------------------------|
| `MALOJA_URL`               | Yes       |         | Base URL of your installation |
| `MALOJA_API_KEY`           | Yes       |         | Api Key                       |

### JSON-Based

See [`maloja.json.example`](../config/maloja.json.example)

## [Last.fm](https://www.last.fm)

[Register for an API account here.](https://www.last.fm/api/account/create)

The Callback URL is actually specified by multi-scrobbler but to keep things consistent you should use
```
http://localhost:9078/lastfm/callback
```
or replace `localhost:9078` with your own base URL

### ENV-Based

| Environmental Variable | Required? | Default |          Description          |
|----------------------------|-----------|---------|-------------------------------|
| `LASTFM_API_KEY`           | Yes       |         | Api Key from your API Account |
| `LASTFM_SECRET`            | Yes       |         | Shared secret from your API Account |
| `LASTFM_REDIRECT_URI`      | No        | `http://localhost:{PORT}/lastfm/callback`        | Url to use for authentication. Must include `lastfm/callback` somewhere in it |
| `LASTFM_SESSION`           | No        |         | Session id. Will be generated by authentication flow if not provided.                       |

### JSON-Based

See [`lastfm.json.example`](../config/lastfm.json.example)
