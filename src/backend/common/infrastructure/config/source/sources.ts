import * as z from "zod";
import {azuracastSourceAIOConfigSchema, azuracastSourceConfigSchema} from "./azuracast.ts";
import {chromecastSourceAIOConfigSchema, chromecastSourceConfigSchema} from "./chromecast.ts";
import {listenbrainzEndpointSourceAIOConfigSchema, listenbrainzEndpointSourceConfigSchema} from "./endpointlz.ts";
import {lastFmEndpointSourceAIOConfigSchema, lastFmEndpointSourceConfigSchema} from "./endpointlfm.ts";
import {deezerInternalSourceConfigSchema, deezerInternalAIOConfigSchema} from "./deezer.ts";
import {jellyApiSourceAIOConfigSchema, jellyApiSourceConfigSchema} from "./jellyfin.ts";
import {jRiverSourceAIOConfigSchema, jRiverSourceConfigSchema} from "./jriver.ts";
import {kodiSourceAIOConfigSchema, kodiSourceConfigSchema} from "./kodi.ts";
import {lastFmSouceAIOConfigSchema, lastfmSourceConfigSchema} from "./lastfm.ts";
import {listenBrainzSourceAIOConfigSchema, listenBrainzSourceConfigSchema} from "./listenbrainz.ts";
import {mopidySourceAIOConfigSchema, mopidySourceConfigSchema} from "./mopidy.ts";
import {mpdSourceAIOConfigSchema, mpdSourceConfigSchema} from "./mpd.ts";
import {mprisSourceAIOConfigSchema, mprisSourceConfigSchema} from "./mpris.ts";
import {musikcubeSourceAIOConfigSchema, musikcubeSourceConfigSchema} from "./musikcube.ts";
import {musicCastSourceConfigSchema, musicCastSourceAIOConfigSchema} from "./musiccast.ts";
import {plexApiSourceConfigSchema, plexApiSourceAIOConfigSchema} from "./plex.ts";
import {spotifySourceAIOConfigSchema, spotifySourceConfigSchema} from "./spotify.ts";
import {subsonicSourceAIOConfigSchema, subSonicSourceConfigSchema} from "./subsonic.ts";
import {vlcSourceAIOConfigSchema, vlcSourceConfigSchema} from "./vlc.ts";
import {webScrobblerSourceAIOConfigSchema, webScrobblerSourceConfigSchema} from "./webscrobbler.ts";
import {ytMusicSourceAIOConfigSchema, ytMusicSourceConfigSchema} from "./ytmusic.ts";
import {yandexMusicBridgeSourceAIOConfigSchema, yandexMusicBridgeSourceConfigSchema} from "./ymbridge.ts";
import {icecastSourceAIOConfigSchema, icecastSourceConfigSchema} from "./icecast.ts";
import {koitoSourceAIOConfigSchema, koitoSourceConfigSchema} from "./koito.ts";
import {malojaSourceAIOConfigSchema, malojaSourceConfigSchema} from "./maloja.ts";
import {tealSourceAIOConfigSchema, tealSourceConfigSchema} from "./tealfm.ts";
import {rockskySourceAIOConfigSchema, rockskySourceConfigSchema} from "./rocksky.ts";
import {librefmSouceAIOConfigSchema, librefmSourceConfigSchema} from "./librefm.ts";
import {sonosSourceAIOConfigSchema, sonosSourceConfigSchema} from "./sonos.ts";
import {appleMusicSourceAIOConfigSchema, appleMusicSourceConfigSchema} from "./applemusic.ts";

export const sourceConfigSchema = z.union([
    spotifySourceConfigSchema,
    plexApiSourceConfigSchema,
    deezerInternalSourceConfigSchema,
    listenbrainzEndpointSourceConfigSchema,
    lastFmEndpointSourceConfigSchema,
    subSonicSourceConfigSchema,
    jellyApiSourceConfigSchema,
    lastfmSourceConfigSchema,
    librefmSourceConfigSchema,
    ytMusicSourceConfigSchema,
    yandexMusicBridgeSourceConfigSchema,
    mprisSourceConfigSchema,
    mopidySourceConfigSchema,
    listenBrainzSourceConfigSchema,
    jRiverSourceConfigSchema,
    kodiSourceConfigSchema,
    webScrobblerSourceConfigSchema,
    chromecastSourceConfigSchema,
    malojaSourceConfigSchema,
    musikcubeSourceConfigSchema,
    musicCastSourceConfigSchema,
    mpdSourceConfigSchema,
    vlcSourceConfigSchema,
    icecastSourceConfigSchema,
    azuracastSourceConfigSchema,
    koitoSourceConfigSchema,
    tealSourceConfigSchema,
    rockskySourceConfigSchema,
    sonosSourceConfigSchema,
    appleMusicSourceConfigSchema,
]);

export type SourceConfig = z.infer<typeof sourceConfigSchema>;

export const sourceAIOConfigSchema = z.union([
    spotifySourceAIOConfigSchema,
    plexApiSourceAIOConfigSchema,
    deezerInternalAIOConfigSchema,
    listenbrainzEndpointSourceAIOConfigSchema,
    lastFmEndpointSourceAIOConfigSchema,
    subsonicSourceAIOConfigSchema,
    jellyApiSourceAIOConfigSchema,
    lastFmSouceAIOConfigSchema,
    librefmSouceAIOConfigSchema,
    ytMusicSourceAIOConfigSchema,
    yandexMusicBridgeSourceAIOConfigSchema,
    mprisSourceAIOConfigSchema,
    mopidySourceAIOConfigSchema,
    listenBrainzSourceAIOConfigSchema,
    jRiverSourceAIOConfigSchema,
    kodiSourceAIOConfigSchema,
    webScrobblerSourceAIOConfigSchema,
    chromecastSourceAIOConfigSchema,
    malojaSourceAIOConfigSchema,
    musikcubeSourceAIOConfigSchema,
    musicCastSourceAIOConfigSchema,
    mpdSourceAIOConfigSchema,
    vlcSourceAIOConfigSchema,
    icecastSourceAIOConfigSchema,
    azuracastSourceAIOConfigSchema,
    koitoSourceAIOConfigSchema,
    tealSourceAIOConfigSchema,
    rockskySourceAIOConfigSchema,
    sonosSourceAIOConfigSchema,
    appleMusicSourceAIOConfigSchema,
]);

export type SourceAIOConfig = z.infer<typeof sourceAIOConfigSchema>;