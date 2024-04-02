---
sidebar_position: 1
title: 'Overview'
---

# Installation

# Local

After installation see [service.md](service.md) to configure multi-scrobbler to run automatically in the background.

## Nodejs

Clone this repository somewhere and then install from the working directory

```shell
git clone https://github.com/FoxxMD/multi-scrobbler.git .
cd multi-scrobbler
nvm use # optional, to set correct Node version
npm install
npm run build
npm run start
```

#### Rollup build error

During building if you encounter an error like: `Your current platform "XXX" and architecture "XXX" combination is not yet supported by the native Rollup build.`

Modify `overrides` in `package.json` to use `@rollup/wasm-node` as a drop-in replacement for rollup:

```json
"overrides": {
  "spotify-web-api-node": {
    "superagent": "$superagent"
  }
  "vite": {
    "rollup": "npm:@rollup/wasm-node@^4.9.6"
  }
}
```

See [this issue](https://github.com/FoxxMD/multi-scrobbler/issues/135#issuecomment-1927080260) for more detail.

### Usage Examples

* The web UI and API is served on port `9078`. This can be modified using the `PORT` environmental variable.

#### Using [file-based](../configuration/configuration.md#file-based-configuration) configuration

```shell
npm run start
```

#### Using [env-based](../configuration/configuration.md#env-based-configuration) configuration

```shell
SPOTIFY_CLIENT_ID=yourId SPOTIFY_CLIENT_SECRET=yourSecret MALOJA_URL="http://domain.tld" node src/index.js
```

## Flatpak

You must have [Flatpak](https://flatpak.org/) installed on your system.

```shell
flatpak install flathub io.github.foxxmd.multiscrobbler
```

**Note:** Flatpak users have experienced issues when using multi-scrobbler as a long-running process. Due to the relative difficulty in debugging issues with flatpak installations it is recommended:

* to use a [Docker](#docker) installation if possible or
* only if you need access to host-level resources like dbus for [MPRIS](https://foxxmd.github.io/multi-scrobbler/docs/configuration#mpris) and cannot run a [nodejs](#nodejs) installation

### Usage Examples

#### Using [file-based](../configuration/configuration.md#file-based-configuration) configuration

The config directory for multi-scrobbler as a flatpak can be found under `/home/YourUser/.var/app/io.github.foxxmd.multiscrobbler/config`

```shell
flatpak run io.github.foxxmd.multiscrobbler
```

#### Using [env-based](../configuration/configuration.md#env-based-configuration) configuration

There are a few [options for running flatpak applications with temporary or permanent environmental variables.](https://ardasevinc.dev/launch-flatpak-apps-with-custom-args-and-environment-variables)

```shell
flatpak run --env=SPOTIFY_CLIENT_ID=yourId --envSPOTIFY_CLIENT_SECRET=yourSecret --env=MALOJA_URL="http://domain.tld" io.github.foxxmd.multiscrobbler
```

## Docker

Cross-platform images are built for x86 (Intel/AMD) and ARM64 (IE Raspberry Pi)

[Dockerhub](https://hub.docker.com/r/foxxmd/multi-scrobbler)
```
docker.io/foxxmd/multi-scrobbler:latest
```

[Github Packages](https://github.com/FoxxMD/multi-scrobbler/pkgs/container/multi-scrobbler)
```
ghcr.io/foxxmd/multi-scrobbler:latest
```

Or use the provided [docker-compose.yml](../../../docker-compose.yml) after modifying it to fit your configuration.

Recommended configuration steps for docker or docker-compose usage:

#### Storage

You **must** bind a host directory into the container for storing configurations and credentials. Otherwise, these will be lost when the container is updated.

* [Using `-v` method for docker](https://docs.docker.com/storage/bind-mounts/#start-a-container-with-a-bind-mount): `-v /path/on/host/config:/config`
* [Using docker-compose](https://docs.docker.com/compose/compose-file/compose-file-v3/#short-syntax-3): `- /path/on/host/config:/config`

#### Networking

If you are using a [bridge network](https://www.appsdeveloperblog.com/docker-networking-bridging-host-and-overlay/) (default docker setup) you **must** map a port to the container in order to access the dashboard and use MS with some sources (Plex, Jellyfin).

The default container port is `9078`. To map container to host port:

* With [docker](https://docs.docker.com/engine/reference/commandline/run/#publish): `-p 9078:9078` (first port is the port on the host to use)
* With [docker-compose](https://docs.docker.com/compose/compose-file/compose-file-v3/#short-syntax-1): `- "9078:9078"`

##### Base URL

Optionally, when

* using a [Source or Client](../configuration/configuration.md) that has a "Redirect URI" that you have not explicitly defined
* and
  * using a bridge network or
  * installing MS on a different machine than the one used to view the dashboard

set the [Base URL](../configuration/configuration.md#base-url) as the IP of the host machine. (This is the IP you would use to view the dashboard in a browser)

* With docker: `-e BASE_URL="http://hostMachineIP"` (first port is the port on the host to use)
* With docker-compose: [see comments in docker-compose.yml](../../../docker-compose.yml)

#### Other

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

### Network Issues

If you encounter networking issues like:

* sporadic timeouts (`ETIMEDOUT`) without a pattern
* DNS errors (`EAI_AGAIN`) that do no occur consistently
* Failures to reach a host that was previously fine (`EHOSTUNREACH`)

there may be an issue with the underlying docker image OS (alpine) that may be solved by switching to a different image. Try switching to a `*-debian` variant tag (only available for x86/x64 hosts) to see if this resolves your issue. IE `multi-scrobbler:latest-debian` or `multi-scrobbler:develop-debian`

## Docker Usage Examples

If installing on a different machine make sure all redirect URIs are defined or that you have set a [Base URL](#base-url).

### Using [env-based](../configuration/configuration.md#env-based-configuration) configuration

```bash
docker run -e "SPOTIFY_CLIENT_ID=yourId" -e "SPOTIFY_CLIENT_SECRET=yourSecret" -e "MALOJA_URL=http://domain.tld" -e "MALOJA_API_KEY=1234" -e "PUID=1000" -e "PGID=1000" -p 9078:9078 -v /path/on/host/config:/config foxxmd/multi-scrobbler
```

### Using [file-based](../configuration/configuration.md#file-based-configuration) configuration

```bash
docker run -e "PUID=1000" -e "PGID=1000" -p 9078:9078 -v /path/on/host/config:/config foxxmd/multi-scrobbler
```

See the [docker-compose.yml](../../../docker-compose.yml) file for how to use with docker-compose.
