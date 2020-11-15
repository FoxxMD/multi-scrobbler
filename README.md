# spotify-scrobbler

A single-user, javascript app to scrobble your recent plays to [Maloja](https://github.com/krateng/maloja) (and other clients, eventually)

## Installation


### Locally

Clone this repository somewhere and then install from the working directory

```bash
npm install
```

### Docker

[Dockerhub link](https://hub.docker.com/repository/docker/foxxmd/spotify-scrobbler)

```
foxxmd/spotify-scrobbler:latest
```

The `CONFIG_DIR` and `LOG_DIR` environmental variables are also configurable as docker env variables in order to specify the path to mount to in the container.

## Setup App and Spotify

All configuration is done through json files or environment variables. Reference the [examples in the config folder](https://github.com/FoxxMD/spotify-scrobbler/tree/master/config) more detailed explanations and structure.

**A property from a json config will override the corresponding environmental variable.**

### General

[JSON config example](https://github.com/FoxxMD/spotify-scrobbler/blob/master/config/config.json.example)

These environmental variables do not have a config file equivalent (to make Docker configuration easier)

| Environmental Variable | Required? |   Default    |                                        Description                                        |
|----------------------------|-----------|--------------|-------------------------------------------------------------------------------------------|
| `CONFIG_DIR`               |         - | `CWD/config` | Directory to look for all other configuration files                                       |
| `LOG_PATH`                 |         - | `CWD/logs`   | If `false` no logs will be written. If `string` will be the directory logs are written to |
| `PORT`                     |         - | 9078         | Port to run web server on                                                                 |

**The app must have permission to write to `CONFIG_DIR` in order to store the current spotify access token.**

### Spotify

To access your Spotify history you must [register an application](https://developer.spotify.com/dashboard) to get a Client ID/Secret. Make sure to also whitelist your redirect URI in the application settings.

[Spotify config example](https://github.com/FoxxMD/spotify-scrobbler/blob/master/config/spotify.json.example)

All variables have a config file equivalent which will overwrite the ENV variable if present (so config file is not required if ENVs present)

| Environmental Variable     | Required? |            Default             |                    Description                     |
|----------------------------|-----------|----------------------------------|----------------------------------------------------|
| `SPOTIFY_CLIENT_ID`        | Yes       |                                  |                                                    |
| `SPOTIFY_CLIENT_SECRET`    | Yes       |                                  |                                                    |
| `SPOTIFY_ACCESS_TOKEN`     | -         |                                  | Must include either this token or client id/secret |
| `SPOTIFY_REFRESH_TOKEN`    | -         |                                  |                                                    |
| `SPOTIFY_REDIRECT_URI`     | -         | `http://localhost:{PORT}/callback` | URI must end in `callback`                         |

The app will automatically obtain new access/refresh token if needed and possible. These will override values from configuration.

## Setup Scrobble Clients

At least one client (the only one right now...) must be setup in order for the app to work. Client configurations can alternatively be configred in the main `config.json` configuration (see configuration example linked in **General** setup)

### Maloja

[Maloja config example](https://github.com/FoxxMD/spotify-scrobbler/blob/master/config/maloja.json.example)

All variables have a config file equivalent which will overwrite the ENV variable if present (so config file is not required if ENVs present)

| Environmental Variable | Required? | Default |          Description          |
|----------------------------|-----------|---------|-------------------------------|
| `MALOJA_URL`               | Yes       |         | Base URL of your installation |
| `MALOJA_API_KEY`           | Yes       |         | Api Key                       |

## Usage

Output is provided to stdout/stderr as well as file if specified in configuration.

On first startup you may need to authorize Spotify by visiting a callback URL. The default url to open is:

```
https://localhost:9078/authSpotify
```

### Running Directly

```
node index.js
```

### Docker

All required variables can be passed through environmental variables (see above)

or

mount a directory on the host machine containing your JSON configs to the config directory:

```
docker run ... -v /path/on/host/config:/home/node/config ...
```

## License

MIT
