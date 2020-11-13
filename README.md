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

Environment Variables
* CONFIG_DIR - Default `./config` - Sets configuration directory to look for all other configuration files (if they are not specified)
* CONFIG_PATH - Default `CONFIG_DIR/config.json`
* LOG_PATH - Default `true` - If `false` no logs will be written. If `string` will be the directory logs are written to
* PORT - Default 9078 - Port to run web server on (for authentication callbacks)


### Spotify

[Spotify config example](https://github.com/FoxxMD/spotify-scrobbler/blob/master/config/spotify.json.example)

Environment Variables
* SPOTIFY_CONFIG_PATH - Optional, defaults to `CONFIG_DIR/spotify.json`
* SPOTIFY_CLIENT_ID - **Required**
* SPOTIFY_CLIENT_SECRET - **Required**
* SPOTIFY_ACCESS_TOKEN - Optional if client/secret provided
* SPOTIFY_REFRESH_TOKEN - Optional if client/secret provided
* SPOTIFY_REDIRECT_URI - Optional, default is `http://localhost:{port}/callback`

The app will automatically obtain new access/refresh token if needed and possible. These will override values from configuration.

### Maloja

[Maloja config example](https://github.com/FoxxMD/spotify-scrobbler/blob/master/config/maloja.json.example)

Environment Variables
* MALOJA_CONFIG_PATH - Optional, defaults to `CONFIG_DIR/maloja.json`
* MALOJA_URL - **Required** - Base Url of your Maloja installation
* MALOJA_API_KEY - **Required** - Api Key for scrobbling

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
