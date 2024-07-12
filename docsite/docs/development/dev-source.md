---
toc_min_heading_level: 2
toc_max_heading_level: 5
sidebar_position: 2
title: Source Development/Tutorial
---

<details>

<summary>Table of Contents</summary>

<!-- TOC -->
  * [Scenario](#scenario)
  * [Minimal Implementation](#minimal-implementation)
    * [Define and Implement Config](#define-and-implement-config)
    * [Create CoolPlayer Source](#create-coolplayer-source)
    * [Initialize Source from Config](#initialize-source-from-config)
    * [Implement Play Object Transform](#implement-play-object-transform)
    * [Implement Stages](#implement-stages)
      * [Build Data](#build-data)
      * [Check Connection](#check-connection)
      * [Test Auth](#test-auth)
    * [Implement Polling](#implement-polling)
  * [Further Implementation](#further-implementation)
    * [Backlog](#backlog)
    * [Other Source Types](#other-source-types)
      * [Music History Source](#music-history-source)
      * [Non-Polling Source](#non-polling-source)
      * [Basic Source](#basic-source)
        * [Discovery](#discovery)
        * [Scrobbling](#scrobbling)
<!-- TOC -->

</details>

This document will provide a step-by-step guide for creating a (trivial) new Source in MS alongside describing what aspects of the Source need to be implemented based on the service you use. Before using this document you should review [Common Development](dev-common.md#common-development).

## Scenario

You are the developer of a fancy, new self-hosted web-based media player called **Cool Player.** Cool Player has a slick interface and many bells and whistles, but most importantly it has an API. The API:

* Has an unauthenticated health endpoint at `/api/health` that returns `200` if the service is running properly
* Has authenticated endpoints that require a user-generated token in the header `Authorization MY_TOKEN`
  * Has a `/api/recent` endpoint that lists recently played tracks with a timestamp
  * Has a `/api/now-playing` endpoint that returns information about the state of the player like current track, player position in the track, etc...
* Cool Player is by default accessed on port `6969`
* Your personal instance of Cool Player is hosted at `http://192.168.0.100:6969` and the api is accessed at `http://192.168.0.100:6969/api`

Because there is an API that MS can actively read this will be a **polling** Source where MS sends requests to Cool Player to get scrobble information -- as opposed to an **ingress** Source like Jellyfin/Plex that uses webhooks from the service to send data to MS.

## Minimal Implementation

### Define and Implement Config

We will create a new config interface for Cool Player using the [Common Config](dev-common.md#config) and tell MS it is a valid config that can be used.

Create a new file for your config:

```ts title="/src/backend/common/infrastructure/config/source/coolplayer.ts"
import { PollingOptions } from "../common.js";
import { CommonSourceConfig, CommonSourceData } from "./index.js";

// all of the required data for the Build Data and Test Auth stages (from Common Development docs)
// should go here
export interface CoolPlayerSourceData extends CommonSourceData, PollingOptions {
// remember to annotation your properties!

  /**
   * The user-generated token for Cool Player auth created in Cool Player -> Settings -> User -> Tokens
   *
   * @example f243331e-cf5b-49d7-846b-0845bdc965b4
   * */
  token: string
  /**
   * The host and port where Cool Player is hosted
   *
   * @example http://192.168.0.100:6969
   * */
  baseUrl: string
}

export interface CoolPlayerSourceConfig extends CommonSourceConfig {
  data: CoolPlayerSourceData
}

export interface CoolPlayerSourceAIOConfig extends CoolPlayerSourceConfig {
  // when using the all-in-one 'config.json' this is how users will identify this source
  type: 'coolplayer'
}
```

Add the new interface to the list of valid interfaces for sources:

```ts title="src/backend/common/infrastructure/config/source/sources.ts"
import { ChromecastSourceAIOConfig, ChromecastSourceConfig } from "./chromecast.js";
// ...
// highlight-next-line
import { CoolPlayerSourceAIOConfig, CoolPlayerSourceConfig } from "./coolplayer.js";

export type SourceConfig =
        SpotifySourceConfig
        // ...
        // highlight-next-line
        | CoolPlayerSourceConfig;

export type SourceAIOConfig =
        SpotifySourceAIOConfig
        // ...
        // highlight-next-line
        | CoolPlayerSourceAIOConfig;
```

Finally, add the source type identifier to the list of valid identifiers

```ts title="src/backend/common/infrastructure/Atomic.ts"
export type SourceType =
    'spotify'
    // ...
    // highlight-next-line
    | 'coolplayer';

export const sourceTypes: SourceType[] = [
    'spotify',
    // ...
    // highlight-next-line
    'coolplayer'
];
```

Now we will create a new Source inheriting from [`AbstractComponent`](dev-common.md#concrete-class) that:

* accepts our config interface
* implements a function to transform CoolPlayer's track data into a [**PlayObject**](dev-common.md#play-object)
* implements required [stages](dev-common.md#stages)
* implements required methods to current player state and/or now playing track

### Create CoolPlayer Source

First we create a new Source called `CoolPlayerSource` and setup our constructor to accept the config and [specify Auth behavior.](dev-common.md#stage-test-auth)

```ts title="src/backend/sources/SpotifySource.ts"
import { CoolPlayerSourceConfig } from "../common/infrastructure/config/source/coolplayer.js";
import MemorySource from "./MemorySource.js";
import {
  InternalConfig,
} from "../common/infrastructure/Atomic.js";

// MemorySource is the base class used for polling-type Sources
export default class CoolPlayerSource extends MemorySource {

  // type hints for TS to know what the base class config looks like
  declare config: CoolPlayerSourceConfig;

  constructor(name: any, config: CoolPlayerSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
    super('coolplayer', name, config, internal, emitter);

    // Cool Player required authentication
    this.requiresAuth = true;
    // but does not require user interaction for auth to work
    this.requiresAuthInteraction = false;
    // tells MS this is a Source that can be activity monitored through API
    this.canPoll = true;
  }
}
```

### Initialize Source from Config

When MS starts it reads all configs and determines which Source to build based on the configs found. We need to tell it to build a `CoolPlayerSource` when a `coolplayer` config type is found.

We modify `ScrobbleSources.ts` to add `CoolPlayerSource` as an option:

```ts title="src/backend/sources/ScrobbleSources.ts"
// ...
import { CoolPlayerSource, CoolPlayerData } from "./CoolPlayerSource.js";

export default class ScrobbleSources {
  // ...
  buildSourcesFromConfig = async (additionalConfigs: ParsedConfig[] = []) => {
    // ...

    // if CoolPlayerSource should be able to be built from ENVs only 
    // then add it as a case statement here
    for (const sourceType of sourceTypes) {
      switch (sourceType) {
              // ...
        case 'musikcube':
          // ...
          break;
              // highlight-start
        case 'coolplayer':
          const cp = {
            baseUrl: process.env.COOL_URL,
            token: process.env.COOL_TOKEN
          }
          if (!Object.values(cp).every(x => x === undefined)) {
            configs.push({
              type: 'coolplayer',
              name: 'unnamed',
              source: 'ENV',
              mode: 'single',
              configureAs: defaultConfigureAs,
              data: cp as CoolPlayerData
            });
          }
          break;
              // highlight-end
        default:
          break;
      }
    }
  }

  // ...

  // (required) create new CoolPlayerSource if source config type is 'coolplayer'
  addSource = async (clientConfig: ParsedConfig, defaults: SourceDefaults = {}) => {
    // ...
    let newSource: AbstractSource;
    switch (type) {
      // ...
      case 'musikcube':
        // ...
        break;
            // highlight-start
      case 'coolplayer':
        newSource = await new CoolPlayerSource(name, compositeConfig as CoolPlayerSourceConfig, internal, this.emitter);
        break;
            // highlight-end
      default:
        break;
    }
  }
}
```

### Implement Play Object Transform

Now we will create a static function that is used to take the track data returned from Cool Player's API and return a standard [`PlayObject`.](dev-common.md#play-object)

```ts title="src/backend/sources/CoolPlayerSource.ts"
import dayjs from "dayjs";
import {
  FormatPlayObjectOptions,
} from "../common/infrastructure/Atomic.js";
import { PlayObject } from "../../core/Atomic.js";

export default class CoolPlayerSource extends MemorySource {
  // ...

  // 'obj' should ideally be a real TS interface
  // if CoolPlayer has a ts/js client we would use that otherwise
  // we should build our own interfaces to represent track data from Cool Player's API
  static formatPlayObj(obj: any, options: FormatPlayObjectOptions = {}): PlayObject {
    const {
      trackName,
      artistName,
      albumName,
      duration,
      playedAt,
    } = obj;

    return {
      data: {
        artists: [artistName],
        album: albumName,
        track: trackName,
        // assuming seconds
        duration,
        // assuming playedAt is an ISO8601 timestamp
        playDate: dayjs(playedAt)
      },
      meta: {
        source: 'CoolPlayer'
      }
    }
  }
}
```

### Implement Stages

Next we will implement the [Stages](dev-common.md#stages) required to get CoolPlayerSource running.

#### Build Data

First we implement the [Build Data Stage](dev-common.md#stage-build-data). We will check that the `token` and `baseUrl` properties have been provided by the user. Additionally, we will parse the baseUrl and add default ports/prefix.

```ts title="src/backend/sources/CoolPlayerSource.ts"
import { URL } from "url";
// ...

export default class CoolPlayerSource extends MemorySource {

  baseUrl!: URL;

  // ...

  static parseConnectionUrl(val: string) {
    const normal = normalizeUrl(val, {removeTrailingSlash: false, normalizeProtocol: true})
    const url = new URL(normal);

    if (url.port === null || url.port === '') {
      url.port = '6969';
    }
    if (url.pathname === '/') {
      url.pathname = '/api/';
    }
    return url;
  }

  protected async doBuildInitData(): Promise<true | string | undefined> {
    const {
      token,
      baseUrl
    } = this.config;
    if (token === null || token === undefined || (typeof token === 'string' && token.trim() === '')) {
      throw new Error(`'token' must be defined`);
    }

    if (baseUrl === null || baseUrl === undefined || (typeof baseUrl === 'string' && baseUrl.trim() === '')) {
      throw new Error(`'baseUrl' must be defined`);
    }
    try {
      this.baseUrl = CoolPlayerSource.parseConnectionUrl(baseUrl);
    } catch (e) {
      throw new Error(`Could not parse baseUrl: ${baseUrl}`, {cause: e});
    }

    this.logger.verbose(`Config URL: ${baseUrl} => Normalized: '${this.url.toString()}'`);
    return true;
  }
}
```

#### Check Connection

Second we will implement the [Check Connection Stage](dev-common.md#stage-check-connection):

```ts title="src/backend/sources/CoolPlayerSource.ts"
import request from 'superagent';
import { UpstreamError } from "../common/errors/UpstreamError.js";
// ...
export default class CoolPlayerSource extends MemorySource {

  // ...

  protected async doCheckConnection(): Promise<true | string | undefined> {
    try {
      const resp = await request.get(`${this.baseUrl}/health`);
      return true;
      // if /health returned version info we could instead read response and return a string with version info for visibility to the user
      // return `Cool Player Version: ${resp.body.version}`;
    } catch (e) {
      throw e;
    }
  }
}
```

#### Test Auth

Finally, we will implement [Auth Test Stage](dev-common.md#stage-test-auth):

```ts title="src/backend/sources/CoolPlayerSource.ts"
import request from 'superagent';
import { UpstreamError } from "../common/errors/UpstreamError.js";
// ...
export default class CoolPlayerSource extends MemorySource {

  // ...

  doAuthentication = async () => {
    try {
      const resp = await request
              .get(`${this.baseUrl}/recent`)
              .set('Authorization', `Token ${this.config.token}`);
      return true;
    } catch (e) {
      // if Cool Player returned an error as json we could parse it from error body and throw new Error with the message
      throw e;
    }
  }
}
```

### Implement Polling

The majority of Sources MS monitors primarily operate as a source of truth for a **music player** rather than a **played music history.** Only Listenbrainz and Last.fm operate as a source of music history.

To this end, MS implements a [state machine](https://www.freecodecamp.org/news/state-machines-basics-of-computer-science-d42855debc66/) that emulates the behavior of a music player in order to keep track of when a song you are listening to should be scrobbled. It does this by monitoring the "currently playing" track reported by a Source's service, with varying degrees of accuracy depending on what information is returned from the service. The state machine is implemented in `MemorySource` which our `CoolPlayerSource` inherits from.

For a polling Source to work properly we need to implement a function, [`getRecentlyPlayed`](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/sources/AbstractSource.ts#L92), that returns PlayObjects that are "newly" played. These are then checked against previously "discovered" plays and their timestamp to determine if they should be surfaced to Clients to scrobble.

To take advantage of the `MemorySource` state machine we will additionally use [`processRecentPlays`](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/sources/MemorySource.ts#L113) from `MemorySource` inside `getRecentlyPlayed`. We pass track and/or player state returned from the Source service to `processRecentPlayers`. It then takes care of deriving Source player state based on how this data changes over time. The advantage to using `processRecentPlays` is that our Source service does not necessarily need to pass any player information -- as long as the track info has a **duration** we can more-or-less determine if it has been played long enough to scrobble.

```ts title="src/backend/sources/CoolPlayerSource.ts"
import request from 'superagent';
import {
  SourceData,
  PlayerStateData,
  SINGLE_USER_PLATFORM_ID
} from "../common/infrastructure/Atomic.js";
// ...
export default class CoolPlayerSource extends MemorySource {

  // ...

  protected async getRecentlyPlayed(options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> {
    const plays: SourceData[] = [];
    try {
      // currently playing tracks/player state data
      const resp = await request
              .get(`${this.baseUrl}/now-playing`)
              .set('Authorization', `Token ${this.config.token}`);
      const {
        body: {
          playerState, // 'playing' or 'stopped' or 'paused'...
          position, // number of seconds into the track IE at position 48 -> ( 0:48/3:56 in player UI )
          play: { /* track data */}
        }
      } = resp;

      // transform into standard player state data
      const playerData: PlayerStateData = {
        platformId: SINGLE_USER_PLATFORM_ID,
        play: CoolPlayerSource.formatPlayObj(play),
        position
      };

      // if Cool Player does return player state we can also push a regular PlayObject to this list
      plays.push(playerData);
    } catch (e) {
      throw e;
    }

    // process player state through state machine
    // if the track changes or player state changes
    // and currently played track has been listened to long enough to be scrobbled it will return in newPlays
    const newPlays = this.processRecentPlays(plays);

    // finally, we return new plays and MS checks to see if they have been previously seen 
    // before signalling to Clients that they can be scrobbled
    return newPlays;
  }
}
```

Congratulations! Your `CoolPlayerSource` has been minimally implemented and can now be used in multi-scrobbler.

## Further Implementation

### Backlog

To have your Source try to scrobble "missed" tracks when MS starts up the Source's service must be able to provide:

* track information
* timestamp of when the track was played

In your Source implement [`getBackloggedPlays`](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/sources/AbstractSource.ts#L235) and set setting in constructor indicating it has backlogging capabilities:

```ts title="src/backend/sources/CoolPlayerSource.ts"
import request from 'superagent';
import {
  PlayObject,
} from "../common/infrastructure/Atomic.js";
// ...
export default class CoolPlayerSource extends MemorySource {

  constructor(/* ... */) {
    super(/* ... */);
    // ...

    // tell MS it should try to get backlogged tracks on startup
    this.canBacklog = true;
  }

  // ...

  protected getBackloggedPlays = async (options: RecentlyPlayedOptions): Promise<PlayObject[]> => {
    try {
      const resp = await request
              .get(`${this.baseUrl}/recent`)
              .set('Authorization', `Token ${this.config.token}`);

      // assuming list from body looks like track info returned in 
      // "Implement Play Object Transform" section
      const {
        body = []
      } = resp;

      return body.map(x => CoolPlayerSource.formatPlayObj(x));
    } catch (e) {
      throw new Error('Error occurred while getting recently played', {cause: e});
    }

  }
}
```

### Other Source Types

There are some scenarios where polling and/or state machine is not the right tool to handle determining if incoming data should be scrobbled:

* The Source service handles scrobble threshold internally, the data being received should always be scrobbled (WebScrobbler, Plex, Tautulli, Listenbrainz, Last.fm)
* You prefer to handle the scrobble determination yourself

#### Music History Source

If the Source is still polling but the track returned should always be scrobbled if not already seen IE the Source service is a **music history source** (Listenbrainz, Last.fm), rather than a music player, then simply indicate to MS the source of truth type by setting it in the constructor. The state machine will always return a track if it is new and not seen, regardless of how recently it was seen:


```ts title="src/backend/sources/CoolPlayerSource.ts"
import { SOURCE_SOT } from "../../core/Atomic.js";
// ...
export default class CoolPlayerSource extends MemorySource {

  constructor(/* ... */) {
    super(/* ... */);
    // ...

    // tell MS it should immediately scrobble any new, unseen tracks from the upstream service
    this.playerSourceOfTruth = SOURCE_SOT.HISTORY;
  }
}
```

#### Non-Polling Source

**Ingress** Sources (like Plex, Tautulli, Webscrobbler, Jellyfin) do not having a polling mechanism because the upstream service contacts MS when there is an event, rather than MS contacting the upstream service.

For these Sources you will need to implement endpoints in `src/service/api.ts` and corresponding files. See the existing Sources in the project as references for how to do this. 

You may still wish to use the state machine `MemorySource` (like Jellyfin) if the events received are not "scrobble" events but instead of implementing `getRecentlyPlayed` you will implement your own function in your Source class, like `handle()`, that receives data and then uses `processRecentPlays`.

After new plays have been determined see the next section for how to scrobble...

#### Basic Source

At the core of a Source that implements `AbstractSource`'s functionality is the ability to **Discover** and **Scrobble** plays. 

These functions are not seen in the MVP `CoolPlayerSource` because they are automatically done by the polling functionality after being returned from `getRecentlyPlayed`.

##### Discovery

A Source keeps track of all the "plays" that are determined to be valid for scrobbling. When a play is valid it is checked to see if it has already been "discovered" by comparing the track info and timestamp of the play against already discovered plays. This prevents duplicate scrobbling by using the Source's own data and simplifies scrobbling for Sources by allowing your implementation to "always" ingest track data without having to worry about whether its new or not -- `AbstractSource` and `discover()` will take care of that for you.

```ts title="src/backend/sources/MyBasicSource.ts"
export default class MyBasicSource extends AbstractSource {
  handle(somePlay: PlayObject) {
    // if the track is "new" and not seen before it is returned in the discovered list
    // we then know it is OK to be sent to Clients for scrobbling
    const discovered: PlayObject[] = this.discover([somePlay]);
  }
}
```

This additionally will be surfaced to the user in the Dashboard in the "Tracks Discovered" page.

##### Scrobbling

After a play is verified to be discovered we can then scrobble it. This will emit the plays to the ScrobbleClients service which then disseminates the play to all Clients that were configured to listen in the Source's config.

```ts title="src/backend/sources/MyBasicSource.ts"
export default class MyBasicSourceSource extends AbstractSource {
  handle(somePlay: PlayObject) {
    const discovered: PlayObject[] = this.discover([somePlay]);
    // emit plays that can be scrobbled by clients
    this.scrobble(discovered);
  }
}
```

If your service only emits an event when a play is scrobbled you can _technically_ skip using `discover()` but it is good practice to use it unless you have a very good reason not to.

:::note

Using `scrobble()` does not guarantee a track is actually scrobbled! The Scrobble Clients also check the play against their own "recently scrobbled" list to prevent duplicates.

:::
