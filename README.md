# spotify-scrobbler

A single-user, javascript app to scrobble your recent plays to [Maloja](https://github.com/krateng/maloja) (and other clients, eventually)

## Installation

Clone this repository somewhere and then install from the working directory

```bash
npm install
```

## Setup/Configuration

All configuration is done through json files or environment variables. Reference the [examples in the config folder](https://github.com/FoxxMD/spotify-scrobbler/tree/master/config) more detailed explanations and structure.

**A property from a json config will override the environmental variable.**

### General

[JSON config example](https://github.com/FoxxMD/spotify-scrobbler/blob/master/config/config.json.example)

These environmental variables do not have a config file equivalent (to make Docker configuration easier)

| Environmental Variable | Required? |   Default    |                                        Description                                        |
|----------------------------|-----------|--------------|-------------------------------------------------------------------------------------------|
| `CONFIG_DIR`               |         - | `CWD/config` | Directory to look for all other configuration files                                       |
| `LOG_PATH`                 |         - | `CWD/logs`   | If `false` no logs will be written. If `string` will be the directory logs are written to |
| `PORT`                     |         - | 9078         | Port to run web server on                                                                 |

### Spotify

[Spotify config example](https://github.com/FoxxMD/spotify-scrobbler/blob/master/config/spotify.json.example)

All variables have a config file equivalent which will overwrite the ENV variable if present. 


| Environmental Variable     | Required? |            Default             |                    Description                     |
|----------------------------|-----------|----------------------------------|----------------------------------------------------|
| `SPOTIFY_CLIENT_ID`        | Yes       |                                  |                                                    |
| `SPOTIFY_CLIENT_SECRET`    | Yes       |                                  |                                                    |
| `SPOTIFY_ACCESS_TOKEN`     | -         |                                  | Must include either this token or client id/secret |
| `SPOTIFY_REFRESH_TOKEN`    |           |                                  |                                                    |
| `SPOTIFY_REDIRECT_URI`     |           | `http://localhost:{PORT}/callback` | URI must end in `callback`                         |

The app will automatically obtain new access/refresh token if needed and possible. These will override values from configuration.

### Maloja

[Maloja config example](https://github.com/FoxxMD/spotify-scrobbler/blob/master/config/maloja.json.example)

All variables have a config file equivalent which will overwrite the ENV variable if present. 


| Environmental Variable | Required? | Default |          Description          |
|----------------------------|-----------|---------|-------------------------------|
| `MALOJA_URL`               | Yes       |         | Base URL of your installation |
| `MALOJA_API_KEY`           | Yes       |         | Api Key                       |



## Usage

Output is provided to stdout/stderr as well as file if specified in configuration.

On first startup you may need to authroize Spotify by visiting a callback URL. The default url to open is:

```
https://localhost:9078/authSpotify
```

### Running Directly

```
node index.js
```

### Docker

[Docker repository](https://hub.docker.com/repository/docker/foxxmd/spotify-scrobbler)
```
foxxmd/spotify-scrobbler:latest
```

Minimal configuration requires you to bind a host directory for the configuration directory in the container:

```
docker run ... -v /path/on/host/config:/home/node/config ...
```

## License

MIT
