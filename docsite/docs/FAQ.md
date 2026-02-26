---
toc_min_heading_level: 2
toc_max_heading_level: 5
---

## Connection Issues

### Webscrobbler/Listenbrainz Endpoint doesn't connect {#ingress-connection}

These sources are **ingress-based** which means that multi-scrobbler waits for the Webscrobbler extension or app using Listenbrainz Endpoint to contact multi-scrobbler, as opposed to multi-scrobbler contacting them.

multi-scrobbler will log information about any server that connects to it for these services. In the logs it looks something like this:

```
[2025-07-10 12:32:21.417 -0400] INFO   : [App] [API] [Ingress] [WebScrobbler] [Ingress] [WebScrobbler] Received request from a new remote address: ::ffff:127.0.0.1 (192.168.0.100) (UA: Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0)
[2025-07-10 12:32:21.418 -0400] INFO   : [App] [API] [Ingress] [WebScrobbler] [Ingress] [WebScrobbler] ::ffff:127.0.0.1 (192.168.0.100) (UA: Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0) Received data for API URL slug '(none)' for the first time.
```
It also logs if a server tries to connect to a URL that it does not recognize:
```
2023-02-22T11:16:12-05:00 debug  : [App             ] Server received POST request from ::ffff:192.168.0.100 (UA: PlexMediaServer/1.24.5.5173-8dcc73a59) to unknown route: /plkex
```
**So, if you do not see either of these in your logs then the Source is not able to connect to your multi-scrobbler instance at all.**

This is not something multi-scrobbler can fix and means you have an issue in your network.

#### Troubleshooting

Check or try all these steps before submitting an issue:

##### Turn on Debug Logging

First, turn on **debug** logging for multi-scrobbler by setting the environmental variable `DEBUG_MODE=true`. Then, check the output for any additional information.

##### Check Host name and URL

The URLs examples in the [configuration](/configuration#base-url) documentation assume you are running Webscrobbler/LFM Endpoint on the same server as multi-scrobbler. If these are not the same machine then you need to determine the IP address or domain name that multi-scrobbler is reachable at and use that instead of `localhost` when configuring these sources. **This is likely the same host name that you would use to access the web interface for multi-scrobbler.**

EX `http://localhost:9078/api/webscrobbler` -> `http://192.168.0.140:9078/api/webscrobbler`

##### Check Firewall and Port Forwarding

If the machine multi-scrobbler is running on has a firewall ensure that port **9078** is open. Or if it is in another network entirely make sure your router is forwarding this port and it is open to the correct machine.

##### Check Source Service Logs

###### Webscrobbler

See [Debugging the extension](https://github.com/web-scrobbler/web-scrobbler/wiki/Debug-the-extension) to get logs which should have information about failed requests.

### Spotify/Deezer/LastFM won't authenticate

Ensure any **client id** or **secrets** are correct in your configuration.

The callback/redirect URL for these services must be:

* the same address you would use to access the multi-scrobbler web interface
  * the web-interface must be accessible from the browser you are completing authentication from.

If multi-scrobbler is not running on the same machine your browser is on then the default/example addresses (`http://localhost...`) **will not work.** You must determine the address you can reach the web interface at (such as `http://192.168.0.140:9078`) then use that in place of `localhost` in the callback URLs.

EX `http://localhost:9078/lastfm/callback` -> `http://192.168.0.220:9078/lastfm/callback`

### I get errors with `ECONNRESET` `ETIMEDOUT` `ENOTFOUND` `EAI_AGAIN`

These are errors indicating a network issue is occuring between you and the Source/Client.

* `ECONNRESET` means the upstream service unexpectedly closed the connection
* `ETIMEDOUT` means the upstream service did not respond to a request MS
* `ENOTFOUND` means that MS could not find a DNS record for the domain of the upstream service
* `EAI_AGAIN` means that a DNS server did not respond to MS's request to lookup the record for a domain

`ECONNRESET` and timeout issues can occur when you have a poor connection or if the upstream service is overloaded or is generally not behaving well. This is a common occurrence for Listenbrainz/Musicbrainz related requests.

Please check the [Upstream Services Status Page](https://status.multi-scrobbler.app) to independently verify if the service is misbehaving. If the service is up and has good uptime then the issue may be in your network.

`ENOTFOUND` and `EAI_AGAIN` and generally caused by DNS caching (stale records) or misbehaving DNS servers. Though this can happen at the upstream service's end, it is *usually* an issue in your network. If you run a Pihole, AdGaurd, or other DNS solution try flushing the cache for the mishaving domain and check that your DNS application is working correctly. 

### Youtube Music fails after some time

If you see errors in multi-scrobbler for YTM that contain **401** or **403** like

```
Error: Could not send the specified request to browse. Status code: 401
```

then YTM has invalidated your authentication.

First, ensure you are NOT using [YoutubeTV authentication.](/configuration/sources/youtube-music?ytmAuth=ytt#authentication) If you completed authentication by entering a "User Code" you are using YoutubeTV which has stopped working. You should reauthenticate using **Cookies** or **Custom OAuth.**

#### When using OAuth Client Authentication

Refresh your authentication by using the **(Re)authenticate** link from MS's web dashboard.

#### When using Cookies Authentication

The library MS uses relies on scraping the YTM site by using cookies from your actual browser to pretend it is a browser. It does its best to keep these up to date but since this is not an official way to access the service YTM may invalidate your access _to the authenticated session_ at any time. How this is triggered is unknown and not something multi-scrobbler can control. You can help limit the chance of your session being invalidated by [getting the cookie from an Incognito/Private Session](https://github.com/LuanRT/YouTube.js/issues/803#issuecomment-2504032666) and then immediately closing the browser afterwards.

To re-authenticate MS [follow the YTM instructions to retrieve a new set of cookies for multi-scrobbler](/configuration/sources/youtube-music?ytmAuth=cookie#authentication) and then restart MS to potentially resolve the problem.

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

### Google Cast track information is missing/incorrect or MS player has weird times

The Google Cast integration relies on a few common fields in the data it receives from your casting device. Every platform that can cast (Spotify, Pandora, etc...) *should* use these fields the same but there are slight differences between their implementations that may confuse multi-scrobbler. Specific platforms may also return more information in non-common fields that are undocumented.

To diagnose these issues you [**must enable payload logging**](/configuration/sources/google-cast#cast-troubleshooting) for your google cast Source, run MS, and then include logs with this output from that run. Without the raw data logged from your cast device it will be nearly impossible to resolve your issue.

### Google Cast device does not track media

It is likely the app playing on the cast device is incorrectly reporting the media type as **not music**. 

MS logs will tell you what type the media is reported as with lines like:

```
My Artist - Example Track has 'unknown' media type and allowUnknownMedia=false, will not track
```

Refer to [Allow Unknown Media Type](/configuration/sources/google-cast#allow-unknown-media-type) section to fix this

```
My Artist - Example Track has 'movie' media type so will not track
```

Refer to [Force Media Tracking](/configuration/sources/google-cast#forcing-media-tracking) section to fix this

### VLC is not scrobbling fields correctly

Before reporting an issue turn on metadata logging in the MS VLC configuration, [see the VLC documentation.](/configuration/sources/vlc#vlc-information-reporting)

### Youtube Music misses or duplicates scrobbles

<details>

  <summary>How MS detects YTM history</summary>

  In order for multi-scrobbler to accurately determine if a song has been scrobbled it needs **a source of truth.** For YTM this is a "history" list scraped from the YTM website. Unfortunately, the data in this list can be (often) inconsistent which makes it hard for multi-scrobbler to "trust" that it is correct and determine when/if new scrobbles occur. This inconsistency is not something multi-scrobbler can control -- it is a side-effect of having to use an unofficial method to access YTM (scraping).

  To compensate for this multi-scrobbler resets when it considers this list the "source of truth" based on if the list changes in an inconsistent way between consecutive checks. New scrobbles can only be detected when this list is "OK" as a source of truth for N+1 checks. Therefore, any new tracks that appear when the list is inconsistent will be ignored.

  Duplicate scrobbles can also occur if the change between two checks is technically consistent. For instance, if you listen to a track twice in some period, separated by other music, YTM will sometimes "remove" the track from the earlier time (further down in your history) and "re-add" it at the top of the history.

</details>

#### Reporting YTM scrobble issues

If you experience scrobble detection issues you can help improve MS's YTM heureistic by providing thorough feedback as [an issue.](https://github.com/FoxxMD/multi-scrobbler/issues/new?assignees=&labels=bug&projects=&template=01-bug-report.yml&title=bug%3A+) **Please do the following to provide the most useful report:**

##### Turn on Change Detection

In your YTM configuration (`ytmusic.json`) add `logDiff` under `options` like this:


```json
{
    "type": "ytmusic",
    "name": "MyYTM",
    "data": { ... },
    "options": {
        "logDiff": true
    }
}
```

or set either ENVs:

* `YTM_LOG_DIFF=true`
* [`DEBUG_MODE=true`](/configuration#debug-mode)

This will cause MS to log YTM history changes similar to this:

```
[Ytmusic - MyYTM] Changes from last seen list:
1. (tuhe1CpHRxY) KNOWER - I’m The President --- undefined => Moved -  Originally at 6
2. (Mtg8V6Xa2nc) Vulfpeck - Romanian Drinking Song --- Schvitz => Moved -  Originally at 1
3. (rxbCaiyYSXM) Nightmares On Wax - You Wish --- In A Space Outta Sound => Moved -  Originally at 2
4. (tMt_YXr90AM) Gorillaz - O Green World --- undefined => Moved -  Originally at 3
...
```

Which are essential to troubleshooting this behavior.


##### Turn on File Logging

Optionally, if your logs are busy due to many other sources, you can log **only** YTM logs to a file. Turn this on with the `logToFile` config option:

```json
{
    "type": "ytmusic",
    "name": "MyYTM",
    "data": { ... },
    "options": {
        "logDiff": true,
        "logToFile": true
    }
}
```

This will cause MS to write YTM logs to a file in your `logs` folder named `ytmusic-MyYTM.log` (based on your source name).

##### Provide Detail and Context

Provide a detailed account of how you were using YTM when the issue occurred, including things like:

* the platform listening on (desktop, mobile, 3rd party client, etc...)
* any changes in platform
  * > I switched from desktop to listening on my phone...
* how you were listening to music
  * > I was playing an album start to finish
  * > I listened to two songs in a row, then browsed for a new song in library by artist, then went back to a song in the queue...

Explain the expected behavior (it should have scrobbled songs x, y, then z) and what actually happened (it scrobbled songs x, then y, then x again, then z)

Provide ALL logs from the time when the issue occurred including logs from BEFORE (ideally 2-3 minutes of logs) and AFTER the issue.