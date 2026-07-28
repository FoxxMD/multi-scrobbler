import * as z from "zod";
import {azuracastSourceAIOConfigSchema, azuracastSourceConfigSchema, type AzuracastSourceAIOConfig, type AzuracastSourceConfig} from "./azuracast.ts";
import {chromecastSourceAIOConfigSchema, chromecastSourceConfigSchema, type ChromecastSourceAIOConfig, type ChromecastSourceConfig} from "./chromecast.ts";
import {listenbrainzEndpointSourceAIOConfigSchema, listenbrainzEndpointSourceConfigSchema, type ListenbrainzEndpointSourceAIOConfig, type ListenbrainzEndpointSourceConfig} from "./endpointlz.ts";
import {lastFmEndpointSourceAIOConfigSchema, lastFmEndpointSourceConfigSchema, type LastFMEndpointSourceAIOConfig, type LastFMEndpointSourceConfig} from "./endpointlfm.ts";
import {deezerInternalSourceConfigSchema, deezerInternalAIOConfigSchema, type DeezerInternalSourceConfig, type DeezerInternalAIOConfig} from "./deezer.ts";
import {jellyApiSourceAIOConfigSchema, jellyApiSourceConfigSchema, type JellyApiSourceAIOConfig, type JellyApiSourceConfig} from "./jellyfin.ts";
import {jRiverSourceAIOConfigSchema, jRiverSourceConfigSchema, type JRiverSourceAIOConfig, type JRiverSourceConfig} from "./jriver.ts";
import {kodiSourceAIOConfigSchema, kodiSourceConfigSchema, type KodiSourceAIOConfig, type KodiSourceConfig} from "./kodi.ts";
import {lastFmSouceAIOConfigSchema, lastfmSourceConfigSchema, type LastFmSouceAIOConfig, type LastfmSourceConfig} from "./lastfm.ts";
import {listenBrainzSourceAIOConfigSchema, listenBrainzSourceConfigSchema, type ListenBrainzSourceAIOConfig, type ListenBrainzSourceConfig} from "./listenbrainz.ts";
import {mopidySourceAIOConfigSchema, mopidySourceConfigSchema, type MopidySourceAIOConfig, type MopidySourceConfig} from "./mopidy.ts";
import {mpdSourceAIOConfigSchema, mpdSourceConfigSchema, type MPDSourceAIOConfig, type MPDSourceConfig} from "./mpd.ts";
import {mprisSourceAIOConfigSchema, mprisSourceConfigSchema, type MPRISSourceAIOConfig, type MPRISSourceConfig} from "./mpris.ts";
import {musikcubeSourceAIOConfigSchema, musikcubeSourceConfigSchema, type MusikcubeSourceAIOConfig, type MusikcubeSourceConfig} from "./musikcube.ts";
import {musicCastSourceConfigSchema, musicCastSourceAIOConfigSchema, type MusicCastSourceConfig, type MusicCastSourceAIOConfig} from "./musiccast.ts";
import {plexApiSourceConfigSchema, plexApiSourceAIOConfigSchema, type PlexApiSourceConfig, type PlexApiSourceAIOConfig} from "./plex.ts";
import {spotifySourceAIOConfigSchema, spotifySourceConfigSchema, type SpotifySourceAIOConfig, type SpotifySourceConfig} from "./spotify.ts";
import {subsonicSourceAIOConfigSchema, subSonicSourceConfigSchema, type SubsonicSourceAIOConfig, type SubSonicSourceConfig} from "./subsonic.ts";
import {vlcSourceAIOConfigSchema, vlcSourceConfigSchema, type VLCSourceAIOConfig, type VLCSourceConfig} from "./vlc.ts";
import {webScrobblerSourceAIOConfigSchema, webScrobblerSourceConfigSchema, type WebScrobblerSourceAIOConfig, type WebScrobblerSourceConfig} from "./webscrobbler.ts";
import {ytMusicSourceAIOConfigSchema, ytMusicSourceConfigSchema, type YTMusicSourceAIOConfig, type YTMusicSourceConfig} from "./ytmusic.ts";
import {yandexMusicBridgeSourceAIOConfigSchema, yandexMusicBridgeSourceConfigSchema, type YandexMusicBridgeSourceAIOConfig, type YandexMusicBridgeSourceConfig} from "./ymbridge.ts";
import {icecastSourceAIOConfigSchema, icecastSourceConfigSchema, type IcecastSourceAIOConfig, type IcecastSourceConfig} from "./icecast.ts";
import {koitoSourceAIOConfigSchema, koitoSourceConfigSchema, type KoitoSourceAIOConfig, type KoitoSourceConfig} from "./koito.ts";
import {malojaSourceAIOConfigSchema, malojaSourceConfigSchema, type MalojaSourceAIOConfig, type MalojaSourceConfig} from "./maloja.ts";
import {tealSourceAIOConfigSchema, tealSourceConfigSchema, type TealSourceAIOConfig, type TealSourceConfig} from "./tealfm.ts";
import {rockskySourceAIOConfigSchema, rockskySourceConfigSchema, type RockskySourceAIOConfig, type RockskySourceConfig} from "./rocksky.ts";
import {librefmSouceAIOConfigSchema, librefmSourceConfigSchema, type LibrefmSouceAIOConfig, type LibrefmSourceConfig} from "./librefm.ts";
import {sonosSourceAIOConfigSchema, sonosSourceConfigSchema, type SonosSourceAIOConfig, type SonosSourceConfig} from "./sonos.ts";
import {appleMusicSourceAIOConfigSchema, appleMusicSourceConfigSchema, type AppleMusicSourceAIOConfig, type AppleMusicSourceConfig} from "./applemusic.ts";
import type { SourceType } from "../../../../../core/Atomic.ts";
import type { CommonSourceConfig } from "./index.ts";

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

export interface SourceTypeConfigMap extends Record<SourceType, [CommonSourceConfig,SourceAIOConfig]> {
    spotify: [SpotifySourceConfig, SpotifySourceAIOConfig],
    plex: [PlexApiSourceConfig, PlexApiSourceAIOConfig],
    deezer: [DeezerInternalSourceConfig, DeezerInternalAIOConfig],
    endpointlz: [ListenbrainzEndpointSourceConfig, ListenbrainzEndpointSourceAIOConfig],
    endpointlfm: [LastFMEndpointSourceConfig, LastFMEndpointSourceAIOConfig],
    icecast: [IcecastSourceConfig, IcecastSourceAIOConfig],
    subsonic: [SubSonicSourceConfig, SubsonicSourceAIOConfig],
    jellyfin: [JellyApiSourceConfig, JellyApiSourceAIOConfig],
    lastfm: [LastfmSourceConfig, LastFmSouceAIOConfig],
    librefm: [LibrefmSourceConfig, LibrefmSouceAIOConfig],
    ytmusic: [YTMusicSourceConfig, YTMusicSourceAIOConfig],
    ymbridge: [YandexMusicBridgeSourceConfig, YandexMusicBridgeSourceAIOConfig],
    maloja: [MalojaSourceConfig, MalojaSourceAIOConfig],
    mpris: [MPRISSourceConfig, MPRISSourceAIOConfig],
    mopidy: [MopidySourceConfig, MopidySourceAIOConfig],
    listenbrainz: [ListenBrainzSourceConfig, ListenBrainzSourceAIOConfig],
    jriver: [JRiverSourceConfig, JRiverSourceAIOConfig],
    kodi: [KodiSourceConfig, KodiSourceAIOConfig],
    chromecast: [ChromecastSourceConfig, ChromecastSourceAIOConfig],
    webscrobbler: [WebScrobblerSourceConfig, WebScrobblerSourceAIOConfig],
    musikcube: [MusikcubeSourceConfig, MusikcubeSourceAIOConfig],
    musiccast: [MusicCastSourceConfig, MusicCastSourceAIOConfig],
    mpd: [MPDSourceConfig, MPDSourceAIOConfig],
    vlc: [VLCSourceConfig, VLCSourceAIOConfig],
    azuracast: [AzuracastSourceConfig, AzuracastSourceAIOConfig],
    koito: [KoitoSourceConfig, KoitoSourceAIOConfig],
    tealfm: [TealSourceConfig, TealSourceAIOConfig],
    rocksky: [RockskySourceConfig, RockskySourceAIOConfig],
    sonos: [SonosSourceConfig, SonosSourceAIOConfig],
    applemusic: [AppleMusicSourceConfig, AppleMusicSourceAIOConfig]
}

export const sourceConfigSchemaMap: { [K in keyof SourceTypeConfigMap]: [z.ZodType<SourceTypeConfigMap[K][0]>, z.ZodType<SourceTypeConfigMap[K][1]>] } = {
    spotify: [spotifySourceConfigSchema, spotifySourceAIOConfigSchema],
    plex: [plexApiSourceConfigSchema, plexApiSourceAIOConfigSchema],
    deezer: [deezerInternalSourceConfigSchema, deezerInternalAIOConfigSchema],
    endpointlz: [listenbrainzEndpointSourceConfigSchema, listenbrainzEndpointSourceAIOConfigSchema],
    endpointlfm: [lastFmEndpointSourceConfigSchema, lastFmEndpointSourceAIOConfigSchema],
    icecast: [icecastSourceConfigSchema, icecastSourceAIOConfigSchema],
    subsonic: [subSonicSourceConfigSchema, subsonicSourceAIOConfigSchema],
    jellyfin: [jellyApiSourceConfigSchema, jellyApiSourceAIOConfigSchema],
    lastfm: [lastfmSourceConfigSchema, lastFmSouceAIOConfigSchema],
    librefm: [librefmSourceConfigSchema, librefmSouceAIOConfigSchema],
    ytmusic: [ytMusicSourceConfigSchema, ytMusicSourceAIOConfigSchema],
    ymbridge: [yandexMusicBridgeSourceConfigSchema, yandexMusicBridgeSourceAIOConfigSchema],
    maloja: [malojaSourceConfigSchema, malojaSourceAIOConfigSchema],
    mpris: [mprisSourceConfigSchema, mprisSourceAIOConfigSchema],
    mopidy: [mopidySourceConfigSchema, mopidySourceAIOConfigSchema],
    listenbrainz: [listenBrainzSourceConfigSchema, listenBrainzSourceAIOConfigSchema],
    jriver: [jRiverSourceConfigSchema, jRiverSourceAIOConfigSchema],
    kodi: [kodiSourceConfigSchema, kodiSourceAIOConfigSchema],
    chromecast: [chromecastSourceConfigSchema, chromecastSourceAIOConfigSchema],
    webscrobbler: [webScrobblerSourceConfigSchema, webScrobblerSourceAIOConfigSchema],
    musikcube: [musikcubeSourceConfigSchema, musikcubeSourceAIOConfigSchema],
    musiccast: [musicCastSourceConfigSchema,  musicCastSourceAIOConfigSchema],
    mpd: [mpdSourceConfigSchema, mpdSourceAIOConfigSchema],
    vlc: [vlcSourceConfigSchema, vlcSourceAIOConfigSchema],
    azuracast: [azuracastSourceConfigSchema, azuracastSourceAIOConfigSchema],
    koito: [koitoSourceConfigSchema, koitoSourceAIOConfigSchema],
    tealfm: [tealSourceConfigSchema, tealSourceAIOConfigSchema],
    rocksky: [rockskySourceConfigSchema, rockskySourceAIOConfigSchema],
    sonos: [sonosSourceConfigSchema, sonosSourceAIOConfigSchema],
    applemusic: [appleMusicSourceConfigSchema, appleMusicSourceAIOConfigSchema]
};

export const validateSourceJson = <T extends keyof SourceTypeConfigMap>(sourceType: T, json: object): SourceTypeConfigMap[T][0] => sourceConfigSchemaMap[sourceType][0].parse(json);
export const validateSourceAIOJson = <T extends keyof SourceTypeConfigMap>(sourceType: T, json: object): SourceTypeConfigMap[T][1] => sourceConfigSchemaMap[sourceType][1].parse(json);