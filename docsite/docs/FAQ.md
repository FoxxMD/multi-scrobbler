---
toc_min_heading_level: 2
toc_max_heading_level: 5
---

## Connection Issues

### Plex/Tautulli/Jellyfin/Webscrobbler don't connect

These sources are **ingress-based** which means that multi-scrobbler waits for the Plex/Tautulli/Jellyfin server (or Webscrobbler extension) to contact multi-scrobbler, as opposed to multi-scrobbler contacting them.

multi-scrobbler will log information about any server that connects to it for these services. In the logs it looks something like this:

```
2023-02-22T10:55:56-05:00 info   : [Ingress - Plex  ] Received request from a new remote address: ::ffff:192.168.0.140 (UA: PlexMediaServer/1.24.5.5173-8dcc73a59)
2023-02-22T10:55:56-05:00 info   : [Ingress - Plex  ] ::ffff:192.168.0.140 (UA: PlexMediaServer/1.24.5.5173-8dcc73a59) Received valid data from server examplePlex for the first time.
2023-02-22T10:55:56-05:00 warn   : [Plex Request    ] Received valid Plex webhook payload but no Plex sources are configured
```
It also logs if a server tries to connect to a URL that it does not recognize:
```
2023-02-22T11:16:12-05:00 debug  : [App             ] Server received POST request from ::ffff:192.168.0.140 (UA: PlexMediaServer/1.24.5.5173-8dcc73a59) to unknown route: /plkex
```
**So, if you do not see either of these in your logs then Plex/Tautulli/Jellyfin/Webscrobbler is not able to connect to your multi-scrobbler instance at all.**

This is not something multi-scrobbler can fix and means you have an issue in your network.

#### Troubleshooting

Check or try all these steps before submitting an issue:

##### Turn on Debug Logging

First, turn on **debug** logging for multi-scrobbler by setting the environmental variable `LOG_LEVEL=debug`:

* using node `LOG_LEVEL=debug ... node src/index.js`
* using docker `docker run -e LOG_LEVEL=debug ... foxxmd/multi-scrobbler`

Check the output for any additional information.

##### Check Host name and URL

The URLs examples in the [configuration](configuration/configuration.mdx) documentation assume you are running Plex/Tautulli/Jellyfin/Webscrobbler on the same server as multi-scrobbler. If these are not the same machine then you need to determine the IP address or domain name that multi-scrobbler is reachable at and use that instead of `localhost` when configuring these sources. **This is likely the same host name that you would use to access the web interface for multi-scrobbler.**

EX `http://localhost:9078/plex` -> `http://192.168.0.140:9078/plex`

##### Check Firewall and Port Forwarding

If the machine multi-scrobbler is running on has a firewall ensure that port **9078** is open. Or if it is in another network entirely make sure your router is forwarding this port and it is open to the correct machine.

##### Check Source Service Logs

Plex/Tautulli/Jellyfin all have logs that will log if they cannot connect to multi-scrobbler. Check these for further information.

###### Plex

Settings -> Manage -> Console

###### Tautulli

Check the command-line output of the application or docker logs.

###### Jellyfin

Administration -> Dashboard -> Advanced -> Logs

###### Webscrobbler

See [Debugging the extension](https://github.com/web-scrobbler/web-scrobbler/wiki/Debug-the-extension) to get logs which should have information about failed requests.

### Jellyfin has warnings about undefined or missing data

Make sure you have 
* [Configured the webhook plugin correctly](configuration/configuration.mdx#jellyfin)
  * Checked the **Send All Properties(ignores template)** option in the webhook settings and **Saved**

multi-scrobbler is known to work on Jellyfin `10.8.9` with Webhook version `11.0.0.0`.

You can verify the payload sent from the webhook by modifying your jellyfin configuration to include `logPayload: true` which will output the raw payload to DEBUG level logging:

```json
[
  {
    "name": "MyJellyfin",
    "clients": [],
    "data": {
      "users": ["FoxxMD"]
    },
    "options": {
      "logPayload": true
    }
  }
]
```

If your issue persists and you open an Issue for it please include the raw payload logs in your report.

### Jellyfin has warnings about missing headers

If you experience issues trying to scrobble with Jellyfin and find this in your MS logs

```
[API] Jellyfin is not sending a request with valid headers...
```

A workaround that may fix this:

* In Webhook settings:
  * [In the webhook you have already configured...](configuration/configuration.mdx#jellyfin)
    * Add Request Header...
      * **Key:** `Content-Type`
      * **Value:** `application/json`
  * Then Save

### Spotify/Deezer/LastFM won't authenticate

Ensure any **client id** or **secrets** are correct in your configuration.

The callback/redirect URL for these services must be:

* the same address you would use to access the multi-scrobbler web interface
  * the web-interface must be accessible from the browser you are completing authentication from.

If multi-scrobbler is not running on the same machine your browser is on then the default/example addresses (`http://localhost...`) **will not work.** You must determine the address you can reach the web interface at (such as `http://192.168.0.140:9078`) then use that in place of `localhost` in the callback URLs.

EX `http://localhost:9078/lastfm/callback` -> `http://192.168.0.220:9078/lastfm/callback`

### Deezer is not working

Deezer has discontinued support for their API and the Deezer Source is now [**deprecated.**](configuration/configuration.mdx#deezer) See [this issue for more discussion.](https://github.com/FoxxMD/multi-scrobbler/issues/175#issuecomment-2296776625)

## Configuration Issues

### Config could not be parsed

If you see something like this in your logs:

```
2023-02-19T10:05:42-06:00 warn   : [App] App config file exists but could not be parsed!
2023-02-19T10:05:42-06:00 error  : [App] Exited with uncaught error
2023-02-19T10:05:42-06:00 error  : [App] Error: config.json could not be parsed
```

It means the JSON in your configuration file is not valid. Copy and paste your configuration into a site like [JSONLint](https://jsonlint.com/) to find out where errors you have and fix them.

## Scrobbling Issues

### Last.fm does not scrobble tracks with multiple artists correctly

This is a limitation of the [Last.fm API](https://www.last.fm/api/show/track.scrobble) where the **artist** field is only one string and Last.fm does not recognize (play well) with "combined" artists.

Multi-scrobbler works the same was the official Spotify-Last.fm integration works -- it only scrobbles the **first** artist on a multi-artist track.

### Jellyfin does not scrobble tracks with multiple artists correctly

This is a limitation caused by the [Jellyfin webhook plugin](https://github.com/FoxxMD/multi-scrobbler/issues/70#issuecomment-1443804712) only sending the first artist to multi-scrobbler. This issues needs to be [fixed upstream on the Jellyfin webhook repository.](https://github.com/jellyfin/jellyfin-plugin-webhook/issues/166)

### Google Cast track information is missing/incorrect or MS player has weird times

The Google Cast integration relies on a few common fields in the data it receives from your casting device. Every platform that can cast (Spotify, Pandora, etc...) *should* use these fields the same but there are slight differences between their implementations that may confuse multi-scrobbler. Specific platforms may also return more information in non-common fields that are undocumented.

To diagnose these issues you [**must enable payload logging**](configuration/configuration.mdx#cast-troubleshooting) for your google cast Source, run MS, and then include logs with this output from that run. Without the raw data logged from your cast device it will be nearly impossible to resolve your issue.

### Google Cast device does not track media

It is likely the app playing on the cast device is incorrectly reporting the media type as **not music**. 

MS logs will tell you what type the media is reported as with lines like:

```
My Artist - Example Track has 'unknown' media type and allowUnknownMedia=false, will not track
```

Refer to [Allow Unknown Media Type](configuration/configuration.mdx#allow-unknown-media-type) section to fix this

```
My Artist - Example Track has 'movie' media type so will not track
```

Refer to [Force Media Tracking](configuration/configuration.mdx#forcing-media-tracking) section to fix this
