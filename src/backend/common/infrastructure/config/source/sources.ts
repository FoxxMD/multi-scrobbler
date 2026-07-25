import * as z from "zod";
import {azuracastSourceAIOConfigSchema, azuracastSourceConfigSchema, type AzuracastSourceConfig} from "./azuracast.ts";
import {chromecastSourceAIOConfigSchema, chromecastSourceConfigSchema, type ChromecastSourceConfig} from "./chromecast.ts";
import {listenbrainzEndpointSourceAIOConfigSchema, listenbrainzEndpointSourceConfigSchema, type ListenbrainzEndpointSourceConfig} from "./endpointlz.ts";
import {lastFmEndpointSourceAIOConfigSchema, lastFmEndpointSourceConfigSchema, type LastFMEndpointSourceConfig} from "./endpointlfm.ts";
import {deezerInternalSourceConfigSchema, deezerSourceConfigSchema, deezerCompatConfigSchema, deezerAIOCompatConfigSchema, type DeezerCompatConfig} from "./deezer.ts";
import {jellyApiSourceAIOConfigSchema, jellyApiSourceConfigSchema, type JellyApiSourceConfig} from "./jellyfin.ts";
import {jRiverSourceAIOConfigSchema, jRiverSourceConfigSchema, type JRiverSourceConfig} from "./jriver.ts";
import {kodiSourceAIOConfigSchema, kodiSourceConfigSchema, type KodiSourceConfig} from "./kodi.ts";
import {lastFmSouceAIOConfigSchema, lastfmSourceConfigSchema, type LastfmSourceConfig} from "./lastfm.ts";
import {listenBrainzSourceAIOConfigSchema, listenBrainzSourceConfigSchema, type ListenBrainzSourceConfig} from "./listenbrainz.ts";
import {mopidySourceAIOConfigSchema, mopidySourceConfigSchema, type MopidySourceConfig} from "./mopidy.ts";
import {mpdSourceAIOConfigSchema, mpdSourceConfigSchema, type MPDSourceConfig} from "./mpd.ts";
import {mprisSourceAIOConfigSchema, mprisSourceConfigSchema, type MPRISSourceConfig} from "./mpris.ts";
import {musikcubeSourceAIOConfigSchema, musikcubeSourceConfigSchema, type MusikcubeSourceConfig} from "./musikcube.ts";
import {musicCastSourceConfigSchema, musicCastSourceAIOConfigSchema, type MusicCastSourceConfig} from "./musiccast.ts";
import {plexApiSourceConfigSchema, plexApiSourceAIOConfigSchema, type PlexApiSourceConfig} from "./plex.ts";
import {spotifySourceAIOConfigSchema, spotifySourceConfigSchema, type SpotifySourceConfig} from "./spotify.ts";
import {subsonicSourceAIOConfigSchema, subSonicSourceConfigSchema, type SubSonicSourceConfig} from "./subsonic.ts";
import {vlcSourceAIOConfigSchema, vlcSourceConfigSchema, type VLCSourceConfig} from "./vlc.ts";
import {webScrobblerSourceAIOConfigSchema, webScrobblerSourceConfigSchema, type WebScrobblerSourceConfig} from "./webscrobbler.ts";
import {ytMusicSourceAIOConfigSchema, ytMusicSourceConfigSchema, type YTMusicSourceConfig} from "./ytmusic.ts";
import {yandexMusicBridgeSourceAIOConfigSchema, yandexMusicBridgeSourceConfigSchema, type YandexMusicBridgeSourceConfig} from "./ymbridge.ts";
import {icecastSourceAIOConfigSchema, icecastSourceConfigSchema, type IcecastSourceConfig} from "./icecast.ts";
import {koitoSourceAIOConfigSchema, koitoSourceConfigSchema, type KoitoSourceConfig} from "./koito.ts";
import {malojaSourceAIOConfigSchema, malojaSourceConfigSchema, type MalojaSourceConfig} from "./maloja.ts";
import {tealSourceAIOConfigSchema, tealSourceConfigSchema, type TealSourceConfig} from "./tealfm.ts";
import {rockskySourceAIOConfigSchema, rockskySourceConfigSchema, type RockskySourceConfig} from "./rocksky.ts";
import {librefmSouceAIOConfigSchema, librefmSourceConfigSchema, type LibrefmSourceConfig} from "./librefm.ts";
import {sonosSourceAIOConfigSchema, sonosSourceConfigSchema, type SonosSourceConfig} from "./sonos.ts";
import {appleMusicSourceAIOConfigSchema, appleMusicSourceConfigSchema, type AppleMusicSourceConfig} from "./applemusic.ts";
import type { SourceType } from "../../../../../core/Atomic.ts";
import type { CommonSourceConfig } from "./index.ts";

export const sourceConfigSchema = z.union([
    spotifySourceConfigSchema,
    plexApiSourceConfigSchema,
    deezerCompatConfigSchema,
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
    deezerAIOCompatConfigSchema,
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

/** Used for docusaurus schemas
 *  We need to show "array of" for each type of config when looking at File Config
 *
 *  This is defined in the AIO config and we *assume* arrays in individual files when parsing in builders
 *  But we don't have any actual definitions for this that we can pull for generating individual schema files
 */
export const spotifySourceConfigsSchema = z.array(spotifySourceConfigSchema);

export type SpotifySourceConfigs = z.infer<typeof spotifySourceConfigsSchema>;

export const plexApiSourceConfigsSchema = z.array(plexApiSourceConfigSchema);

export type PlexApiSourceConfigs = z.infer<typeof plexApiSourceConfigsSchema>;

export const deezerSourceConfigsSchema = z.array(deezerSourceConfigSchema);

export type DeezerSourceConfigs = z.infer<typeof deezerSourceConfigsSchema>;

export const deezerInternalSourceConfigsSchema = z.array(deezerInternalSourceConfigSchema);

export type DeezerInternalSourceConfigs = z.infer<typeof deezerInternalSourceConfigsSchema>;

export const deezerCompatConfigsSchema = z.array(deezerCompatConfigSchema);

export type DeezerCompatConfigs = z.infer<typeof deezerCompatConfigsSchema>;

export const listenbrainzEndpointSourceConfigsSchema = z.array(listenbrainzEndpointSourceConfigSchema);

export type ListenbrainzEndpointSourceConfigs = z.infer<typeof listenbrainzEndpointSourceConfigsSchema>;

export const lastFmEndpointSourceConfigsSchema = z.array(lastFmEndpointSourceConfigSchema);

export type LastFMEndpointSourceConfigs = z.infer<typeof lastFmEndpointSourceConfigsSchema>;

export const subSonicSourceConfigsSchema = z.array(subSonicSourceConfigSchema);

export type SubSonicSourceConfigs = z.infer<typeof subSonicSourceConfigsSchema>;

export const jellyApiSourceConfigsSchema = z.array(jellyApiSourceConfigSchema);

export type JellyApiSourceConfigs = z.infer<typeof jellyApiSourceConfigsSchema>;

export const lastfmSourceConfigsSchema = z.array(lastfmSourceConfigSchema);

export type LastfmSourceConfigs = z.infer<typeof lastfmSourceConfigsSchema>;

export const librefmSourceConfigsSchema = z.array(librefmSourceConfigSchema);

export type LibrefmSourceConfigs = z.infer<typeof librefmSourceConfigsSchema>;

export const ytMusicSourceConfigsSchema = z.array(ytMusicSourceConfigSchema);

export type YTMusicSourceConfigs = z.infer<typeof ytMusicSourceConfigsSchema>;

export const yandexMusicBridgeSourceConfigsSchema = z.array(yandexMusicBridgeSourceConfigSchema);

export type YandexMusicBridgeSourceConfigs = z.infer<typeof yandexMusicBridgeSourceConfigsSchema>;

export const mprisSourceConfigsSchema = z.array(mprisSourceConfigSchema);

export type MPRISSourceConfigs = z.infer<typeof mprisSourceConfigsSchema>;

export const mopidySourceConfigsSchema = z.array(mopidySourceConfigSchema);

export type MopidySourceConfigs = z.infer<typeof mopidySourceConfigsSchema>;

export const listenBrainzSourceConfigsSchema = z.array(listenBrainzSourceConfigSchema);

export type ListenBrainzSourceConfigs = z.infer<typeof listenBrainzSourceConfigsSchema>;

export const jRiverSourceConfigsSchema = z.array(jRiverSourceConfigSchema);

export type JRiverSourceConfigs = z.infer<typeof jRiverSourceConfigsSchema>;

export const kodiSourceConfigsSchema = z.array(kodiSourceConfigSchema);

export type KodiSourceConfigs = z.infer<typeof kodiSourceConfigsSchema>;

export const webScrobblerSourceConfigsSchema = z.array(webScrobblerSourceConfigSchema);

export type WebScrobblerSourceConfigs = z.infer<typeof webScrobblerSourceConfigsSchema>;

export const chromecastSourceConfigsSchema = z.array(chromecastSourceConfigSchema);

export type ChromecastSourceConfigs = z.infer<typeof chromecastSourceConfigsSchema>;

export const malojaSourceConfigsSchema = z.array(malojaSourceConfigSchema);

export type MalojaSourceConfigs = z.infer<typeof malojaSourceConfigsSchema>;

export const musikcubeSourceConfigsSchema = z.array(musikcubeSourceConfigSchema);

export type MusikcubeSourceConfigs = z.infer<typeof musikcubeSourceConfigsSchema>;

export const musicCastSourceConfigsSchema = z.array(musicCastSourceConfigSchema);

export type MusicCastSourceConfigs = z.infer<typeof musicCastSourceConfigsSchema>;

export const mpdSourceConfigsSchema = z.array(mpdSourceConfigSchema);

export type MPDSourceConfigs = z.infer<typeof mpdSourceConfigsSchema>;

export const vlcSourceConfigsSchema = z.array(vlcSourceConfigSchema);

export type VLCSourceConfigs = z.infer<typeof vlcSourceConfigsSchema>;

export const icecastSourceConfigsSchema = z.array(icecastSourceConfigSchema);

export type IcecastSourceConfigs = z.infer<typeof icecastSourceConfigsSchema>;

export const azuracastSourceConfigsSchema = z.array(azuracastSourceConfigSchema);

export type AzuracastSourceConfigs = z.infer<typeof azuracastSourceConfigsSchema>;

export const koitoSourceConfigsSchema = z.array(koitoSourceConfigSchema);

export type KoitoSourceConfigs = z.infer<typeof koitoSourceConfigsSchema>;

export const tealSourceConfigsSchema = z.array(tealSourceConfigSchema);

export type TealSourceConfigs = z.infer<typeof tealSourceConfigsSchema>;

export const rockskySourceConfigsSchema = z.array(rockskySourceConfigSchema);

export type RockskySourceConfigs = z.infer<typeof rockskySourceConfigsSchema>;

export const sonosSourceConfigsSchema = z.array(sonosSourceConfigSchema);

export type SonosSourceConfigs = z.infer<typeof sonosSourceConfigsSchema>;

export const appleMusicSourceConfigsSchema = z.array(appleMusicSourceConfigSchema);

export type AppleMusicSourceConfigs = z.infer<typeof appleMusicSourceConfigsSchema>;

export const atomicSourceInterfaces = [
    'SpotifySourceConfig',
    'PlexApiSourceConfig',
    'DeezerCompatConfig',
    'ListenbrainzEndpointSourceConfig',
    'LastFMEndpointSourceConfig',
    'IcecastSourceConfig',
    'SubSonicSourceConfig',
    'JellyApiSourceConfig',
    'LastfmSourceConfig',
    'LibrefmSourceConfig',
    'YTMusicSourceConfig',
    'YandexMusicBridgeSourceConfig',
    'MalojaSourceConfig',
    'MPRISSourceConfig',
    'MopidySourceConfig',
    'ListenBrainzSourceConfig',
    'JRiverSourceConfig',
    'KodiSourceConfig',
    'ChromecastSourceConfig',
    'WebScrobblerSourceConfig',
    'MusikcubeSourceConfig',
    'MusicCastSourceConfig',
    'MPDSourceConfig',
    'VLCSourceConfig',
    'AzuracastSourceConfig',
    'KoitoSourceConfig',
    'TealSourceConfig',
    'RockskySourceConfig',
    'SonosSourceConfig',
    'AppleMusicSourceConfig'
];

export interface SourceTypeConfigMap extends Record<SourceType, CommonSourceConfig> {
    spotify: SpotifySourceConfig,
    plex: PlexApiSourceConfig,
    deezer: DeezerCompatConfig,
    endpointlz: ListenbrainzEndpointSourceConfig,
    endpointlfm: LastFMEndpointSourceConfig,
    icecast: IcecastSourceConfig,
    subsonic: SubSonicSourceConfig,
    jellyfin: JellyApiSourceConfig,
    lastfm: LastfmSourceConfig,
    librefm: LibrefmSourceConfig,
    ytmusic: YTMusicSourceConfig,
    ymbridge: YandexMusicBridgeSourceConfig,
    maloja: MalojaSourceConfig,
    mpris: MPRISSourceConfig,
    mopidy: MopidySourceConfig,
    listenbrainz: ListenBrainzSourceConfig,
    jriver: JRiverSourceConfig,
    kodi: KodiSourceConfig,
    chromecast: ChromecastSourceConfig,
    webscrobbler: WebScrobblerSourceConfig,
    musikcube: MusikcubeSourceConfig,
    musiccast: MusicCastSourceConfig,
    mpd: MPDSourceConfig,
    vlc: VLCSourceConfig,
    azuracast: AzuracastSourceConfig,
    koito: KoitoSourceConfig,
    tealfm: TealSourceConfig,
    rocksky: RockskySourceConfig,
    sonos: SonosSourceConfig,
    applemusic: AppleMusicSourceConfig
}

const sourceConfigSchemaMap: { [K in keyof SourceTypeConfigMap]: z.ZodType<SourceTypeConfigMap[K]> } = {
    spotify: spotifySourceConfigSchema,
    plex: plexApiSourceConfigSchema,
    deezer: deezerCompatConfigSchema,
    endpointlz: listenbrainzEndpointSourceConfigSchema,
    endpointlfm: lastFmEndpointSourceConfigSchema,
    icecast: icecastSourceConfigSchema,
    subsonic: subSonicSourceConfigSchema,
    jellyfin: jellyApiSourceConfigSchema,
    lastfm: lastfmSourceConfigSchema,
    librefm: librefmSourceConfigSchema,
    ytmusic: ytMusicSourceConfigSchema,
    ymbridge: yandexMusicBridgeSourceConfigSchema,
    maloja: malojaSourceConfigSchema,
    mpris: mprisSourceConfigSchema,
    mopidy: mopidySourceConfigSchema,
    listenbrainz: listenBrainzSourceConfigSchema,
    jriver: jRiverSourceConfigSchema,
    kodi: kodiSourceConfigSchema,
    chromecast: chromecastSourceConfigSchema,
    webscrobbler: webScrobblerSourceConfigSchema,
    musikcube: musikcubeSourceConfigSchema,
    musiccast: musicCastSourceConfigSchema,
    mpd: mpdSourceConfigSchema,
    vlc: vlcSourceConfigSchema,
    azuracast: azuracastSourceConfigSchema,
    koito: koitoSourceConfigSchema,
    tealfm: tealSourceConfigSchema,
    rocksky: rockskySourceConfigSchema,
    sonos: sonosSourceConfigSchema,
    applemusic: appleMusicSourceConfigSchema
};

export const validateSourceJson = <T extends keyof SourceTypeConfigMap>(sourceType: T, json: object): SourceTypeConfigMap[T] => sourceConfigSchemaMap[sourceType].parse(json);

export const sourceInterfaces = [
    'AIOSourceRelaxedConfig',
    ...atomicSourceInterfaces
];
