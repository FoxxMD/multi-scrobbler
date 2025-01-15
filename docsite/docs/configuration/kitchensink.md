---
sidebar_position: 3
title: Kitchen Sink
---

# Example Config using all Possible Features

Scenario: 

* You want to scrobble plays for yourself (Foxx), Fred, and Mary
* Each person has their own Maloja server
* Each person has their own Spotify account
* You have your own Airsonic (subsonic) server you to scrobble from
* You have your own Youtube Music account you want to scrobble from
* Mary has her own Last.fm account she also wants to scrobble to
* Fred has his own Spotify application and provides you with just his access and refresh token because he doesn't trust you (wtf Fred)
* Fred has a Plex server and wants to scrobble everything he plays
* Mary uses Fred's Plex server but only wants to scrobble her plays from the `podcast` library
* The three of you have a shared library on Plex called `party` that you only play when you are hanging out. You want plays from that library to be scrobbled to everyone's servers.
* Fred also has his own Jellyfin server and wants to scrobble everything he plays

### All-in-one Config

```json5 title="CONFIG_DIR/config.json"
{
  "sourceDefaults": {
    "maxPollRetries": 0,          // optional, default # of automatic polling restarts on error. can be overridden by property in individual config
    "maxRequestRetries": 1,       // optional, default # of http request retries a source can make before error is thrown. can be overridden by property in individual config
    "retryMultiplier": 1.5,       // optional, default retry delay multiplier (retry attempt * multiplier = # of seconds to wait before retrying). can be overridden by property in individual config
  },
  "clientDefaults": {
    "maxRequestRetries": 1,       // optional, default # of http request retries a client can make before error is thrown. can be overridden by property in individual config
    "retryMultiplier": 1.5,       // optional, default retry delay multiplier (retry attempt * multiplier = # of seconds to wait before retrying). can be overridden by property in individual config
  },
  "sources": [
    {
      "type": "spotify",
      "name": "foxxSpot",
      "clients": ["foxxMaloja"],
      "data": {
        "clientId": "foxxSpotifyAppId", 
        "clientSecret": "foxxSpotifyAppSecret",
      },
      "options": {
        "maxRequestRetries": 2,  // override default max retries because spotify can...spotty
      }
    },
    {
      "type": "spotify",
      "name": "marySpot",
      "clients": ["maryMaloja"],
      "data": {
        "clientId": "foxxSpotifyAppId", // only need one application, it can be used by all users of this multi-scrobbler instance 
        "clientSecret": "foxxSpotifyAppSecret",
      }
    },
    {
      "type": "spotify",
      "name": "fredSpot",
      "clients": ["fredMaloja"],
      "data": {
        "accessToken": "fredsToken",
        "refreshToken": "fredsRefreshToken",
        "interval": 120, // he also wants a slower check interval because his application already has heavy api usage
      }
    },
    {
      "type": "plex",
      "name": "fredPlex",
      "clients": ["fredMaloja"],
      "data": {
        "token": "JtRnwQWD__XMJF8sT3jc",
        "url": "192.168.0.233:32400",
        "usersallow": ["fredUser"]
      }
    },
    {
      "type": "plex",
      "name": "maryPlex",
      "clients": ["maryMaloja"],
      "data": {
        "token": "JtRnwQWD__XMJF8sT3jc",
        "url": "192.168.0.233:32400",
        "usersallow": ["maryUser"], // still need to specify mary as user so not all users who play from 'podcasts' get scrobbled
        "librariesAllow": ["podcasts"]
      }
    },
    {
      "type": "plex",
      "name": "partyPlex",
      // omitting clients (or making it empty) will make this Source scrobble to all Clients
      "data": {
        "token": "JtRnwQWD__XMJF8sT3jc",
        "url": "192.168.0.233:32400",
        "librariesAllow": ["party"]
      }
    },
    {
      "type": "jellyfin",
      "name": "FredJelly",
      // omitting clients (or making it empty) will make this Source scrobble to all Clients
      "data": {
        "url": "http://localhost:8096",
        "user": "FoxxMD",
        "apiKey": "c9fae8756fbf481ebd9c5bb56bd6540c",
        "usersAllow": ["fredUser"]
      }
    },
    {
      "type": "subsonic",
      "name": "foxxAirsonic",
      "clients": ["foxxMaloja"],
      "data": {
        "user": "foxx",
        "password": "foxxPassword",
        "url": "https://airsonic.foxx.example"
      }
    },
    {
      "type": "ytmusic",
      "name": "foxxYoutube",
      "clients": ["foxxMaloja"],
      "data": {
        "cookie": "__Secure-3PAPISID=3AxsXpy0MKGu75Qb/AkISXGqOnSDn1jEKn; DEVICE_INFO=ChxOekU0Tmpjek5EWTBPRGd3TlRBMk16QXpNdz09EJbS8Z0GGJbS8Z0G; ...",
      }
    },
  ],
  "clients": [
    {
      "type": "maloja",
      "name": "foxxMaloja",
      "data": {
        "url": "https://maloja.foxx.example",
        "apiKey": "foxxApiKey"
      }
    },
    {
      "type": "maloja",
      "name": "fredMaloja",
      "data": {
        "url": "https://maloja.fred.example",
        "apiKey": "fredApiKey"
      }
    },
    {
      "type": "maloja",
      "name": "maryMaloja",
      "data": {
        "url": "https://maloja.mary.example",
        "apiKey": "maryApiKey"
      }
    },
    {
      "type": "lastfm",
      "name": "maryLFM",
      "data": {
        "apiKey": "maryApiKey",
        "secret": "marySecret",
        "redirectUri": "http://localhost:9078/lastfm/callback"
      }
    }
  ]
}

```

### Separate JSON files

```json5 title="CONFIG_DIR/spotify.json"
[
  {
    // may omit 'type' property since app knows this is file is for spotify configs
    "name": "foxxSpot",
    "clients": ["foxxMaloja"],
    "data": {
      "clientId": "foxxSpotifyAppId",
      "clientSecret": "foxxSpotifyAppSecret"
    }
  },
  {
    "name": "marySpot",
    "clients": ["maryMaloja"],
    "data": {
      "clientId": "foxxSpotifyAppId",
      "clientSecret": "foxxSpotifyAppSecret"
    }
  },
  {
    "name": "fredSpot",
    "clients": ["fredMaloja"],
    "data": {
      "accessToken": "fredsToken",
      "refreshToken": "fredsRefreshToken",
      "interval": 120
    }
  },
]
```

```json5 title="CONFIG_DIR/plex.json"
[
  {
    "name": "fredPlex",
    "clients": ["fredMaloja"],
    "data": {
      "token": "JtRnwQWD__XMJF8sT3jc",
      "url": "192.168.0.233:32400",
      "usersallow": ["fredUser"]
    }
  },
  {
    "name": "maryPlex",
    "clients": ["maryMaloja"],
    "data": {
      "token": "JtRnwQWD__XMJF8sT3jc",
      "url": "192.168.0.233:32400",
      "usersallow": ["maryUser"],
      "librariesAllow": ["podcasts"]
    }
  },
  {
    "name": "partyPlex",
    "data": {
      "token": "JtRnwQWD__XMJF8sT3jc",
      "url": "192.168.0.233:32400",
      "librariesAllow": ["party"]
    }
  }
]
```

```json5 title="CONFIG_DIR/jellyfin.json"
[
  {
    "name": "FredJelly",
    "data": {
      "url": "http://localhost:8096",
      "user": "FoxxMD",
      "apiKey": "c9fae8756fbf481ebd9c5bb56bd6540c",
      "usersAllow": ["fredUser"]
    }
  }
]
```

```json5 title="CONFIG_DIR/ytmusic.json"
[
  {
    "type": "ytmusic",
    "name": "foxxYoutube",
    "clients": ["foxxMaloja"],
    "data": {
      "cookie": "__Secure-3PAPISID=3AxsXpy0MKGu75Qb/AkISXGqOnSDn1jEKn; DEVICE_INFO=ChxOekU0Tmpjek5EWTBPRGd3TlRBMk16QXpNdz09EJbS8Z0GGJbS8Z0G; ...",
    }
  }
]
```

```json5 title="CONFIG_DIR/maloja.json"
[
  {
    "name": "foxxMaloja",
    "data": {
      "url": "https://maloja.foxx.example",
      "apiKey": "foxxApiKey"
    }
  },
  {
    "name": "fredMaloja",
    "data": {
      "url": "https://maloja.fred.example",
      "apiKey": "fredApiKey"
    }
  },
  {
    "name": "maryMaloja",
    "data": {
      "url": "https://maloja.mary.example",
      "apiKey": "maryApiKey"
    }
  }
]
```

```json5 title="CONFIG_DIR/lastfm.json"
[
  {
    "name": "maryLFM",
    "data": {
      "apiKey": "maryApiKey",
      "secret": "marySecret",
      "redirectUri": "http://localhost:9078/lastfm/callback"
    }
  }
]
```

