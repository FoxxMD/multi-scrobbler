# Installation

# Local

After installation see [service.md](/docs/service.md) to configure multi-scrobbler to run automatically in the background.

## Nodejs

Clone this repository somewhere and then install from the working directory

```shell
git clone https://github.com/FoxxMD/multi-scrobbler.git .
cd multi-scrobbler
nvm use # optional, to set correct Node version
npm install
npm build
npm start
```

### Usage Examples

* The web UI is served on port `9078`. This can be modified using the `PORT` environmental variable.

#### Using [file-based](/docs/configuration.md#file-based-configuration) configuration

```shell
npm start
```

#### Using [env-based](/docs/configuration.md#env-based-configuration) configuration

```shell
SPOTIFY_CLIENT_ID=yourId SPOTIFY_CLIENT_SECRET=yourSecret MALOJA_URL="http://domain.tld" node src/index.js
```

## Flatpak

You must have [Flatpak](https://flatpak.org/) installed on your system.

```shell
flatpak install flathub io.github.foxxmd.multiscrobbler
```

### Usage Examples

#### Using [file-based](/docs/configuration.md#file-based-configuration) configuration

The config directory for multi-scrobbler as a flatpak can be found under `/home/YourUser/.var/app/io.github.foxxmd.multiscrobbler/config`

```shell
flatpak run io.github.multiscrobbler
```

#### Using [env-based](/docs/configuration.md#env-based-configuration) configuration

There are a few [options for running flatpak applications with temporary or permanent environmental variables.](https://ardasevinc.dev/launch-flatpak-apps-with-custom-args-and-environment-variables)

```shell
flatpak run --env=SPOTIFY_CLIENT_ID=yourId --envSPOTIFY_CLIENT_SECRET=yourSecret --env=MALOJA_URL="http://domain.tld" io.github.foxxmd.multiscrobbler
```

# Docker

Cross-platform images are built for x86 (Intel/AMD) and ARM64 (IE Raspberry Pi)

[Dockerhub](https://hub.docker.com/r/foxxmd/multi-scrobbler)
```
docker.io/foxxmd/multi-scrobbler:latest
```

[Github Packages](https://github.com/FoxxMD/multi-scrobbler/pkgs/container/multi-scrobbler)
```
ghcr.io/foxxmd/multi-scrobbler:latest
```

Or use the provided [docker-compose.yml](/docker-compose.yml) after modifying it to fit your configuration.

Recommended configuration steps for docker or docker-compose usage:

* If you must **bind a host directory into the container for storing configurations and credentials:**
    * [Using `-v` method for docker](https://docs.docker.com/storage/bind-mounts/#start-a-container-with-a-bind-mount): `-v /path/on/host/config:/config`
    * [Using docker-compose](https://docs.docker.com/compose/compose-file/compose-file-v3/#short-syntax-3): `- /path/on/host/config:/config`
* (Optionally) map the web UI port in the container **9078** to the host
    * With [docker](https://docs.docker.com/engine/reference/commandline/run/#publish): `-p 9078:9078` (first port is the port on the host to use)
    * With [docker-compose](https://docs.docker.com/compose/compose-file/compose-file-v3/#short-syntax-1): `- "9078:9078"`
* (Optionally) set the [timezone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) for the container using the environmental variable `TZ` ([docker](https://docs.docker.com/engine/reference/commandline/run/#env)) ([docker-compose](https://docs.docker.com/compose/compose-file/compose-file-v3/#environment))

### Linux Host

If you are

* using [rootless containers with Podman](https://developers.redhat.com/blog/2020/09/25/rootless-containers-with-podman-the-basics#why_podman_)
* running docker on MacOS or Windows

this **DOES NOT** apply to you.

If you are running Docker on a **Linux Host** you must specify `user:group` permissions of the user who owns the **configuration directory** on the host to avoid [docker file permission problems.](https://ikriv.com/blog/?p=4698) These can be specified using the [environmental variables **PUID** and **PGID**.](https://docs.linuxserver.io/general/understanding-puid-and-pgid)

To get the UID and GID for the current user run these commands from a terminal:

* `id -u` -- prints UID
* `id -g` -- prints GID

## Docker Usage Examples

### Using [env-based](/docs/configuration.md#env-based-configuration) configuration

```bash
docker run -e "SPOTIFY_CLIENT_ID=yourId" -e "SPOTIFY_CLIENT_SECRET=yourSecret" -e "MALOJA_URL=http://domain.tld" -e "MALOJA_API_KEY=1234" -e "PUID=1000" -e "PGID=1000" -p 9078:9078 -v /path/on/host/config:/config foxxmd/multi-scrobbler
```

### Using [file-based](/docs/configuration.md#file-based-configuration) configuration

```bash
docker run -e "PUID=1000" -e "PGID=1000" -p 9078:9078 -v /path/on/host/config:/config foxxmd/multi-scrobbler
```

See the [docker-compose.yml](/docker-compose.yml) file for how to use with docker-compose.
