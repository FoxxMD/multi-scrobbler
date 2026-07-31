import * as z from "zod";
import {azuracastSourceAIOConfigSchema, azuracastSourceConfigSchema, envSchemas as azuracastEnvSchemas, type AzuracastSourceAIOConfig, type AzuracastSourceConfig} from "./azuracast.ts";
import {chromecastSourceAIOConfigSchema, chromecastSourceConfigSchema, envSchemas as chromecastEnvSchemas, type ChromecastSourceAIOConfig, type ChromecastSourceConfig} from "./chromecast.ts";
import {listenbrainzEndpointSourceAIOConfigSchema, listenbrainzEndpointSourceConfigSchema, envSchemas as endpointlzEnvSchemas, type ListenbrainzEndpointSourceAIOConfig, type ListenbrainzEndpointSourceConfig} from "./endpointlz.ts";
import {lastFmEndpointSourceAIOConfigSchema, lastFmEndpointSourceConfigSchema, envSchemas as endpointlfmEnvSchemas, type LastFMEndpointSourceAIOConfig, type LastFMEndpointSourceConfig} from "./endpointlfm.ts";
import {deezerInternalSourceConfigSchema, deezerInternalAIOConfigSchema, envSchemas as deezerEnvSchemas, type DeezerInternalSourceConfig, type DeezerInternalAIOConfig} from "./deezer.ts";
import {jellyApiSourceAIOConfigSchema, jellyApiSourceConfigSchema, envSchemas as jellyfinEnvSchemas, type JellyApiSourceAIOConfig, type JellyApiSourceConfig} from "./jellyfin.ts";
import {jRiverSourceAIOConfigSchema, jRiverSourceConfigSchema, envSchemas as jriverEnvSchemas, type JRiverSourceAIOConfig, type JRiverSourceConfig} from "./jriver.ts";
import {kodiSourceAIOConfigSchema, kodiSourceConfigSchema, envSchemas as kodiEnvSchemas, type KodiSourceAIOConfig, type KodiSourceConfig} from "./kodi.ts";
import {lastFmSouceAIOConfigSchema, lastfmSourceConfigSchema, envSchemas as lastfmEnvSchemas, type LastFmSouceAIOConfig, type LastfmSourceConfig} from "./lastfm.ts";
import {listenBrainzSourceAIOConfigSchema, listenBrainzSourceConfigSchema, envSchemas as listenBrainzEnvSchemas, type ListenBrainzSourceAIOConfig, type ListenBrainzSourceConfig} from "./listenbrainz.ts";
import {mopidySourceAIOConfigSchema, mopidySourceConfigSchema, envSchemas as mopidyEnvSchemas, type MopidySourceAIOConfig, type MopidySourceConfig} from "./mopidy.ts";
import {mpdSourceAIOConfigSchema, mpdSourceConfigSchema, envSchemas as mpdEnvSchemas, type MPDSourceAIOConfig, type MPDSourceConfig} from "./mpd.ts";
import {mprisSourceAIOConfigSchema, mprisSourceConfigSchema, envSchemas as mprisEnvSchemas, type MPRISSourceAIOConfig, type MPRISSourceConfig} from "./mpris.ts";
import {musikcubeSourceAIOConfigSchema, musikcubeSourceConfigSchema, envSchemas as musikcubeEnvSchemas, type MusikcubeSourceAIOConfig, type MusikcubeSourceConfig} from "./musikcube.ts";
import {musicCastSourceConfigSchema, musicCastSourceAIOConfigSchema, envSchemas as musicCastEnvSchemas, type MusicCastSourceConfig, type MusicCastSourceAIOConfig} from "./musiccast.ts";
import {plexApiSourceConfigSchema, plexApiSourceAIOConfigSchema, envSchemas as plexEnvSchemas, type PlexApiSourceConfig, type PlexApiSourceAIOConfig} from "./plex.ts";
import {spotifySourceAIOConfigSchema, spotifySourceConfigSchema, envSchemas as spotifyEnvSchemas, type SpotifySourceAIOConfig, type SpotifySourceConfig} from "./spotify.ts";
import {subsonicSourceAIOConfigSchema, subSonicSourceConfigSchema, envSchemas as subsonicEnvSchemas, type SubsonicSourceAIOConfig, type SubSonicSourceConfig} from "./subsonic.ts";
import {vlcSourceAIOConfigSchema, vlcSourceConfigSchema, envSchemas as vlcEnvSchemas, type VLCSourceAIOConfig, type VLCSourceConfig} from "./vlc.ts";
import {webScrobblerSourceAIOConfigSchema, webScrobblerSourceConfigSchema, envSchemas as webScrobblerEnvSchemas, type WebScrobblerSourceAIOConfig, type WebScrobblerSourceConfig} from "./webscrobbler.ts";
import {ytMusicSourceAIOConfigSchema, ytMusicSourceConfigSchema, envSchemas as ytMusicEnvSchemas, type YTMusicSourceAIOConfig, type YTMusicSourceConfig} from "./ytmusic.ts";
import {yandexMusicBridgeSourceAIOConfigSchema, yandexMusicBridgeSourceConfigSchema, envSchemas as ymbridgeEnvSchemas, type YandexMusicBridgeSourceAIOConfig, type YandexMusicBridgeSourceConfig} from "./ymbridge.ts";
import {icecastSourceAIOConfigSchema, icecastSourceConfigSchema, envSchemas as icecastEnvSchemas, type IcecastSourceAIOConfig, type IcecastSourceConfig} from "./icecast.ts";
import {koitoSourceAIOConfigSchema, koitoSourceConfigSchema, envSchemas as koitoEnvSchemas, type KoitoSourceAIOConfig, type KoitoSourceConfig} from "./koito.ts";
import {malojaSourceAIOConfigSchema, malojaSourceConfigSchema, envSchemas as malojaEnvSchemas, type MalojaSourceAIOConfig, type MalojaSourceConfig} from "./maloja.ts";
import {tealSourceAIOConfigSchema, tealSourceConfigSchema, envSchemas as tealEnvSchemas, type TealSourceAIOConfig, type TealSourceConfig} from "./tealfm.ts";
import {rockskySourceAIOConfigSchema, rockskySourceConfigSchema, envSchemas as rockskyEnvSchemas, type RockskySourceAIOConfig, type RockskySourceConfig} from "./rocksky.ts";
import {librefmSouceAIOConfigSchema, librefmSourceConfigSchema, envSchemas as librefmEnvSchemas, type LibrefmSouceAIOConfig, type LibrefmSourceConfig} from "./librefm.ts";
import {sonosSourceAIOConfigSchema, sonosSourceConfigSchema, envSchemas as sonosEnvSchemas, type SonosSourceAIOConfig, type SonosSourceConfig} from "./sonos.ts";
import {appleMusicSourceAIOConfigSchema, appleMusicSourceConfigSchema, envSchemas as appleMusicEnvSchemas, type AppleMusicSourceAIOConfig, type AppleMusicSourceConfig} from "./applemusic.ts";
import type { SourceType } from "../../../../../core/Atomic.ts";
import type { CommonSourceConfig, EnvSourceSchema } from "./index.ts";
import { SimpleError } from "../../../errors/MSErrors.ts";

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

export interface SourceTypeConfigMap extends Record<SourceType, [CommonSourceConfig,SourceAIOConfig, Partial<Pick<CommonSourceConfig, 'data' | 'options'>>]> {
    spotify: [SpotifySourceConfig, SpotifySourceAIOConfig, Partial<Pick<SpotifySourceConfig, 'data' | 'options'>>],
    plex: [PlexApiSourceConfig, PlexApiSourceAIOConfig, Partial<Pick<PlexApiSourceConfig, 'data' | 'options'>>],
    deezer: [DeezerInternalSourceConfig, DeezerInternalAIOConfig, Partial<Pick<DeezerInternalSourceConfig, 'data' | 'options'>>],
    endpointlz: [ListenbrainzEndpointSourceConfig, ListenbrainzEndpointSourceAIOConfig, Partial<Pick<ListenbrainzEndpointSourceConfig, 'data' | 'options'>>],
    endpointlfm: [LastFMEndpointSourceConfig, LastFMEndpointSourceAIOConfig, Partial<Pick<LastFMEndpointSourceConfig, 'data' | 'options'>>],
    icecast: [IcecastSourceConfig, IcecastSourceAIOConfig, Partial<Pick<IcecastSourceConfig, 'data' | 'options'>>],
    subsonic: [SubSonicSourceConfig, SubsonicSourceAIOConfig, Partial<Pick<SubSonicSourceConfig, 'data' | 'options'>>],
    jellyfin: [JellyApiSourceConfig, JellyApiSourceAIOConfig, Partial<Pick<JellyApiSourceConfig, 'data' | 'options'>>],
    lastfm: [LastfmSourceConfig, LastFmSouceAIOConfig, Partial<Pick<LastfmSourceConfig, 'data' | 'options'>>],
    librefm: [LibrefmSourceConfig, LibrefmSouceAIOConfig, Partial<Pick<LibrefmSourceConfig, 'data' | 'options'>>],
    ytmusic: [YTMusicSourceConfig, YTMusicSourceAIOConfig, Partial<Pick<YTMusicSourceConfig, 'data' | 'options'>>],
    ymbridge: [YandexMusicBridgeSourceConfig, YandexMusicBridgeSourceAIOConfig, Partial<Pick<YandexMusicBridgeSourceConfig, 'data' | 'options'>>],
    maloja: [MalojaSourceConfig, MalojaSourceAIOConfig, Partial<Pick<MalojaSourceConfig, 'data' | 'options'>>],
    mpris: [MPRISSourceConfig, MPRISSourceAIOConfig, Partial<Pick<MPRISSourceConfig, 'data' | 'options'>>],
    mopidy: [MopidySourceConfig, MopidySourceAIOConfig, Partial<Pick<MopidySourceConfig, 'data' | 'options'>>],
    listenbrainz: [ListenBrainzSourceConfig, ListenBrainzSourceAIOConfig, Partial<Pick<ListenBrainzSourceConfig, 'data' | 'options'>>],
    jriver: [JRiverSourceConfig, JRiverSourceAIOConfig, Partial<Pick<JRiverSourceConfig, 'data' | 'options'>>],
    kodi: [KodiSourceConfig, KodiSourceAIOConfig, Partial<Pick<KodiSourceConfig, 'data' | 'options'>>],
    chromecast: [ChromecastSourceConfig, ChromecastSourceAIOConfig, Partial<Pick<ChromecastSourceConfig, 'data' | 'options'>>],
    webscrobbler: [WebScrobblerSourceConfig, WebScrobblerSourceAIOConfig, Partial<Pick<WebScrobblerSourceConfig, 'data' | 'options'>>],
    musikcube: [MusikcubeSourceConfig, MusikcubeSourceAIOConfig, Partial<Pick<MusikcubeSourceConfig, 'data' | 'options'>>],
    musiccast: [MusicCastSourceConfig, MusicCastSourceAIOConfig, Partial<Pick<MusicCastSourceConfig, 'data' | 'options'>>],
    mpd: [MPDSourceConfig, MPDSourceAIOConfig, Partial<Pick<MPDSourceConfig, 'data' | 'options'>>],
    vlc: [VLCSourceConfig, VLCSourceAIOConfig, Partial<Pick<VLCSourceConfig, 'data' | 'options'>>],
    azuracast: [AzuracastSourceConfig, AzuracastSourceAIOConfig, Partial<Pick<AzuracastSourceConfig, 'data' | 'options'>>],
    koito: [KoitoSourceConfig, KoitoSourceAIOConfig, Partial<Pick<KoitoSourceConfig, 'data' | 'options'>>],
    tealfm: [TealSourceConfig, TealSourceAIOConfig, Partial<Pick<TealSourceConfig, 'data' | 'options'>>],
    rocksky: [RockskySourceConfig, RockskySourceAIOConfig, Partial<Pick<RockskySourceConfig, 'data' | 'options'>>],
    sonos: [SonosSourceConfig, SonosSourceAIOConfig, Partial<Pick<SonosSourceConfig, 'data' | 'options'>>],
    applemusic: [AppleMusicSourceConfig, AppleMusicSourceAIOConfig, Partial<Pick<AppleMusicSourceConfig, 'data' | 'options'>>]
}

export const sourceConfigSchemaMap: { [K in keyof SourceTypeConfigMap]: [z.ZodType<SourceTypeConfigMap[K][0]>, z.ZodType<SourceTypeConfigMap[K][1]>, EnvSourceSchema<z.ZodObject, SourceTypeConfigMap[K][0]>] } = {
    spotify: [spotifySourceConfigSchema, spotifySourceAIOConfigSchema, spotifyEnvSchemas],
    plex: [plexApiSourceConfigSchema, plexApiSourceAIOConfigSchema, plexEnvSchemas],
    deezer: [deezerInternalSourceConfigSchema, deezerInternalAIOConfigSchema, deezerEnvSchemas],
    endpointlz: [listenbrainzEndpointSourceConfigSchema, listenbrainzEndpointSourceAIOConfigSchema, endpointlzEnvSchemas],
    endpointlfm: [lastFmEndpointSourceConfigSchema, lastFmEndpointSourceAIOConfigSchema, endpointlfmEnvSchemas],
    icecast: [icecastSourceConfigSchema, icecastSourceAIOConfigSchema, icecastEnvSchemas],
    subsonic: [subSonicSourceConfigSchema, subsonicSourceAIOConfigSchema, subsonicEnvSchemas],
    jellyfin: [jellyApiSourceConfigSchema, jellyApiSourceAIOConfigSchema, jellyfinEnvSchemas],
    lastfm: [lastfmSourceConfigSchema, lastFmSouceAIOConfigSchema, lastfmEnvSchemas],
    librefm: [librefmSourceConfigSchema, librefmSouceAIOConfigSchema, librefmEnvSchemas],
    ytmusic: [ytMusicSourceConfigSchema, ytMusicSourceAIOConfigSchema, ytMusicEnvSchemas],
    ymbridge: [yandexMusicBridgeSourceConfigSchema, yandexMusicBridgeSourceAIOConfigSchema, ymbridgeEnvSchemas],
    maloja: [malojaSourceConfigSchema, malojaSourceAIOConfigSchema, malojaEnvSchemas],
    mpris: [mprisSourceConfigSchema, mprisSourceAIOConfigSchema, mprisEnvSchemas],
    mopidy: [mopidySourceConfigSchema, mopidySourceAIOConfigSchema, mopidyEnvSchemas],
    listenbrainz: [listenBrainzSourceConfigSchema, listenBrainzSourceAIOConfigSchema, listenBrainzEnvSchemas],
    jriver: [jRiverSourceConfigSchema, jRiverSourceAIOConfigSchema, jriverEnvSchemas],
    kodi: [kodiSourceConfigSchema, kodiSourceAIOConfigSchema, kodiEnvSchemas],
    chromecast: [chromecastSourceConfigSchema, chromecastSourceAIOConfigSchema, chromecastEnvSchemas],
    webscrobbler: [webScrobblerSourceConfigSchema, webScrobblerSourceAIOConfigSchema, webScrobblerEnvSchemas],
    musikcube: [musikcubeSourceConfigSchema, musikcubeSourceAIOConfigSchema, musikcubeEnvSchemas],
    musiccast: [musicCastSourceConfigSchema,  musicCastSourceAIOConfigSchema, musicCastEnvSchemas],
    mpd: [mpdSourceConfigSchema, mpdSourceAIOConfigSchema, mpdEnvSchemas],
    vlc: [vlcSourceConfigSchema, vlcSourceAIOConfigSchema, vlcEnvSchemas],
    azuracast: [azuracastSourceConfigSchema, azuracastSourceAIOConfigSchema, azuracastEnvSchemas],
    koito: [koitoSourceConfigSchema, koitoSourceAIOConfigSchema, koitoEnvSchemas],
    tealfm: [tealSourceConfigSchema, tealSourceAIOConfigSchema, tealEnvSchemas],
    rocksky: [rockskySourceConfigSchema, rockskySourceAIOConfigSchema, rockskyEnvSchemas],
    sonos: [sonosSourceConfigSchema, sonosSourceAIOConfigSchema, sonosEnvSchemas],
    applemusic: [appleMusicSourceConfigSchema, appleMusicSourceAIOConfigSchema, appleMusicEnvSchemas]
};

export const validateSourceJson = <T extends keyof SourceTypeConfigMap>(sourceType: T, json: object): SourceTypeConfigMap[T][0] => {
    if(sourceConfigSchemaMap[sourceType] === undefined) {
        throw new SimpleError(`No Source has a 'type' of '${sourceType}'`);
    }
    return sourceConfigSchemaMap[sourceType][0].parse(json)
};
export const validateSourceAIOJson = <T extends keyof SourceTypeConfigMap>(sourceType: T, json: object): SourceTypeConfigMap[T][1] => {
    if(sourceConfigSchemaMap[sourceType] === undefined) {
        throw new SimpleError(`No Source has a 'type' of '${sourceType}'`);
    }
    return sourceConfigSchemaMap[sourceType][1].parse(json)
};