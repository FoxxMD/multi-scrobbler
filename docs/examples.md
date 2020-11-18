# Minimal Configuration

Examples assume you have registered a Spotify application with the default callback url of `http://localhost:9078/callback`.

If you use another callback url or domain name you will need to specify at a minimum `SPOTIFY_REDIRECT_URI`.

## Using Environmental Variables

### Local
```
SPOTIFY_CLIENT_ID=yourId SPOTIFY_CLIENT_SECRET=yourSecret MALOJA_URL=http://domain.tld MALOJA_API_KEY=1234 node index.js
```

### Dockerhub

Note: I do not recommend running a container without a `config` volume specified or you will need to reauthorize the app everytime the container is rebuilt.

```
docker run -e "SPOTIFY_CLIENT_ID=yourId" -e "SPOTIFY_CLIENT_SECRET=yourSecret" -e "MALOJA_URL=http://domain.tld" -e "MALOJA_API_KEY=1234" foxxmd/spotify-scrobbler
```

## Using Configuration

Reference the [example json configs.](https://github.com/FoxxMD/multi-scrobbler/tree/master/config)

### Local

```
node index.js
```

### Docker

```
docker run -v /path/on/host/config:/home/node/app/config foxxmd/spotify-scrobbler
```
