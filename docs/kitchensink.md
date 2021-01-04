# Example Config using all Possible Features

Scenario: 

* You want to scrobble plays for yourself (Foxx), Fred, and Mary
* Each person has their own Maloja server
* Each person has their own Spotify account
* You have your own Airsonic (subsonic) server you to scrobble from
* Mary has her own Last.fm account she also wants to scrobble to
* Fred has his own Spotify application and provides you with just his access and refresh token because he doesn't trust you (wtf Fred)
* Fred has a Plex server and wants to scrobble everything he plays
* Mary uses Fred's Plex server but only wants to scrobble her plays from the `podcast` library
* The three of you have a shared library on Plex called `party` that you only play when you are hanging out. You want plays from that library to be scrobbled to everyone's servers.

### All-in-one Config

Using just one config file located at `CONFIG_DIR/config.json`:

```json5
{
  "sources": [
    {
      "type": "spotify",
      "name": "foxxSpot",
      "clients": ["foxxMaloja"],
      "data": {
        "clientId": "foxxSpotifyAppId", 
        "clientSecret": "foxxSpotifyAppSecret",
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
        "user": ["fred@email.com"]
      }
    },
    {
      "type": "plex",
      "name": "maryPlex",
      "clients": ["maryMaloja"],
      "data": {
        "user": ["mary@email.com"], // still need to specify mary as user so not all users who play from 'podcasts' get scrobbled
        "libraries": ["podcasts"]
      }
    },
    {
      "type": "plex",
      "name": "partyPlex",
      // omitting clients (or making it empty) will make this Source scrobble to all Clients
      "data": {
        "libraries": ["party"],
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
      }
    }
  ]
}

```

### Separate JSON files

In `CONFIG_DIR/spotify.json`:

```json5
[
  {
    // may omit 'type' property since app knows this is file is for spotify configs
    "name": "foxxSpot",
    "clients": ["foxxMaloja"],
    "data": {
      "clientId": "foxxSpotifyAppId",
      "clientSecret": "foxxSpotifyAppSecret",
    }
  },
  {
    "name": "marySpot",
    "clients": ["maryMaloja"],
    "data": {
      "clientId": "foxxSpotifyAppId",
      "clientSecret": "foxxSpotifyAppSecret",
    }
  },
  {
    "name": "fredSpot",
    "clients": ["fredMaloja"],
    "data": {
      "accessToken": "fredsToken",
      "refreshToken": "fredsRefreshToken",
      "interval": 120,
    }
  },
]
```

In `CONFIG_DIR/plex.json`

```json5
[
  {
    "name": "fredPlex",
    "clients": ["fredMaloja"],
    "data": {
      "user": ["fred@email.com"]
    }
  },
  {
    "name": "maryPlex",
    "clients": ["maryMaloja"],
    "data": {
      "user": ["mary@email.com"],
      "libraries": ["podcasts"]
    }
  },
  {
    "name": "partyPlex",
    "data": {
      "libraries": ["party"],
    }
  }
]
```

In `CONFIG_DIR/maloja.json`:

```json5
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

In `CONFIG_DIR/lastfm.json`:

```json5
[
  {
    "name": "maryLFM",
    "data": {
      "apiKey": "maryApiKey",
      "secret": "marySecret",
    }
  }
]
```

