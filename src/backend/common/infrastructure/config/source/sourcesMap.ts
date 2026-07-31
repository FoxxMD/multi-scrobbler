import type { EnvSourceSchema } from "./index.ts";
import type {ZodType, ZodObject} from 'zod';
import type { AzuracastSourceAIOConfig, AzuracastSourceConfig} from "./azuracast.ts";
import type { ChromecastSourceAIOConfig, ChromecastSourceConfig} from "./chromecast.ts";
import type { ListenbrainzEndpointSourceAIOConfig, ListenbrainzEndpointSourceConfig} from "./endpointlz.ts";
import type { LastFMEndpointSourceAIOConfig, LastFMEndpointSourceConfig} from "./endpointlfm.ts";
import type { DeezerInternalSourceConfig, DeezerInternalAIOConfig} from "./deezer.ts";
import type { JellyApiSourceAIOConfig, JellyApiSourceConfig} from "./jellyfin.ts";
import type { JRiverSourceAIOConfig, JRiverSourceConfig} from "./jriver.ts";
import type { KodiSourceAIOConfig, KodiSourceConfig} from "./kodi.ts";
import type { LastFmSouceAIOConfig, LastfmSourceConfig} from "./lastfm.ts";
import type { ListenBrainzSourceAIOConfig, ListenBrainzSourceConfig} from "./listenbrainz.ts";
import type { MopidySourceAIOConfig, MopidySourceConfig} from "./mopidy.ts";
import type { MPDSourceAIOConfig, MPDSourceConfig} from "./mpd.ts";
import type { MPRISSourceAIOConfig, MPRISSourceConfig} from "./mpris.ts";
import type { MusikcubeSourceAIOConfig, MusikcubeSourceConfig} from "./musikcube.ts";
import type { MusicCastSourceConfig, MusicCastSourceAIOConfig} from "./musiccast.ts";
import type { PlexApiSourceConfig, PlexApiSourceAIOConfig} from "./plex.ts";
import type { SpotifySourceAIOConfig, SpotifySourceConfig} from "./spotify.ts";
import type { SubsonicSourceAIOConfig, SubSonicSourceConfig} from "./subsonic.ts";
import type { VLCSourceAIOConfig, VLCSourceConfig} from "./vlc.ts";
import type { WebScrobblerSourceAIOConfig, WebScrobblerSourceConfig} from "./webscrobbler.ts";
import type { YTMusicSourceAIOConfig, YTMusicSourceConfig} from "./ytmusic.ts";
import type { YandexMusicBridgeSourceAIOConfig, YandexMusicBridgeSourceConfig} from "./ymbridge.ts";
import type { IcecastSourceAIOConfig, IcecastSourceConfig} from "./icecast.ts";
import type { KoitoSourceAIOConfig, KoitoSourceConfig} from "./koito.ts";
import type { MalojaSourceAIOConfig, MalojaSourceConfig} from "./maloja.ts";
import type { TealSourceAIOConfig, TealSourceConfig} from "./tealfm.ts";
import type { RockskySourceAIOConfig, RockskySourceConfig} from "./rocksky.ts";
import type { LibrefmSouceAIOConfig, LibrefmSourceConfig} from "./librefm.ts";
import type { SonosSourceAIOConfig, SonosSourceConfig} from "./sonos.ts";
import type { AppleMusicSourceAIOConfig, AppleMusicSourceConfig} from "./applemusic.ts";
import type { SourceType } from "../../../../../core/Atomic.ts";
import type { CommonSourceConfig } from "./index.ts";
import type { SourceAIOConfig } from "./sources.ts";
import { SimpleError } from "../../../errors/MSErrors.ts";

export interface SourceTypeConfigMap extends Record<SourceType, [CommonSourceConfig, SourceAIOConfig, Partial<Pick<CommonSourceConfig, 'data' | 'options'>>]> {
    spotify: [SpotifySourceConfig, SpotifySourceAIOConfig, Partial<Pick<SpotifySourceConfig, 'data' | 'options'>>];
    plex: [PlexApiSourceConfig, PlexApiSourceAIOConfig, Partial<Pick<PlexApiSourceConfig, 'data' | 'options'>>];
    deezer: [DeezerInternalSourceConfig, DeezerInternalAIOConfig, Partial<Pick<DeezerInternalSourceConfig, 'data' | 'options'>>];
    endpointlz: [ListenbrainzEndpointSourceConfig, ListenbrainzEndpointSourceAIOConfig, Partial<Pick<ListenbrainzEndpointSourceConfig, 'data' | 'options'>>];
    endpointlfm: [LastFMEndpointSourceConfig, LastFMEndpointSourceAIOConfig, Partial<Pick<LastFMEndpointSourceConfig, 'data' | 'options'>>];
    icecast: [IcecastSourceConfig, IcecastSourceAIOConfig, Partial<Pick<IcecastSourceConfig, 'data' | 'options'>>];
    subsonic: [SubSonicSourceConfig, SubsonicSourceAIOConfig, Partial<Pick<SubSonicSourceConfig, 'data' | 'options'>>];
    jellyfin: [JellyApiSourceConfig, JellyApiSourceAIOConfig, Partial<Pick<JellyApiSourceConfig, 'data' | 'options'>>];
    lastfm: [LastfmSourceConfig, LastFmSouceAIOConfig, Partial<Pick<LastfmSourceConfig, 'data' | 'options'>>];
    librefm: [LibrefmSourceConfig, LibrefmSouceAIOConfig, Partial<Pick<LibrefmSourceConfig, 'data' | 'options'>>];
    ytmusic: [YTMusicSourceConfig, YTMusicSourceAIOConfig, Partial<Pick<YTMusicSourceConfig, 'data' | 'options'>>];
    ymbridge: [YandexMusicBridgeSourceConfig, YandexMusicBridgeSourceAIOConfig, Partial<Pick<YandexMusicBridgeSourceConfig, 'data' | 'options'>>];
    maloja: [MalojaSourceConfig, MalojaSourceAIOConfig, Partial<Pick<MalojaSourceConfig, 'data' | 'options'>>];
    mpris: [MPRISSourceConfig, MPRISSourceAIOConfig, Partial<Pick<MPRISSourceConfig, 'data' | 'options'>>];
    mopidy: [MopidySourceConfig, MopidySourceAIOConfig, Partial<Pick<MopidySourceConfig, 'data' | 'options'>>];
    listenbrainz: [ListenBrainzSourceConfig, ListenBrainzSourceAIOConfig, Partial<Pick<ListenBrainzSourceConfig, 'data' | 'options'>>];
    jriver: [JRiverSourceConfig, JRiverSourceAIOConfig, Partial<Pick<JRiverSourceConfig, 'data' | 'options'>>];
    kodi: [KodiSourceConfig, KodiSourceAIOConfig, Partial<Pick<KodiSourceConfig, 'data' | 'options'>>];
    chromecast: [ChromecastSourceConfig, ChromecastSourceAIOConfig, Partial<Pick<ChromecastSourceConfig, 'data' | 'options'>>];
    webscrobbler: [WebScrobblerSourceConfig, WebScrobblerSourceAIOConfig, Partial<Pick<WebScrobblerSourceConfig, 'data' | 'options'>>];
    musikcube: [MusikcubeSourceConfig, MusikcubeSourceAIOConfig, Partial<Pick<MusikcubeSourceConfig, 'data' | 'options'>>];
    musiccast: [MusicCastSourceConfig, MusicCastSourceAIOConfig, Partial<Pick<MusicCastSourceConfig, 'data' | 'options'>>];
    mpd: [MPDSourceConfig, MPDSourceAIOConfig, Partial<Pick<MPDSourceConfig, 'data' | 'options'>>];
    vlc: [VLCSourceConfig, VLCSourceAIOConfig, Partial<Pick<VLCSourceConfig, 'data' | 'options'>>];
    azuracast: [AzuracastSourceConfig, AzuracastSourceAIOConfig, Partial<Pick<AzuracastSourceConfig, 'data' | 'options'>>];
    koito: [KoitoSourceConfig, KoitoSourceAIOConfig, Partial<Pick<KoitoSourceConfig, 'data' | 'options'>>];
    tealfm: [TealSourceConfig, TealSourceAIOConfig, Partial<Pick<TealSourceConfig, 'data' | 'options'>>];
    rocksky: [RockskySourceConfig, RockskySourceAIOConfig, Partial<Pick<RockskySourceConfig, 'data' | 'options'>>];
    sonos: [SonosSourceConfig, SonosSourceAIOConfig, Partial<Pick<SonosSourceConfig, 'data' | 'options'>>];
    applemusic: [AppleMusicSourceConfig, AppleMusicSourceAIOConfig, Partial<Pick<AppleMusicSourceConfig, 'data' | 'options'>>];
}

export const sourceConfigSchemaMapAsync: { [K in keyof SourceTypeConfigMap]: () => Promise<[ZodType<SourceTypeConfigMap[K][0]>, ZodType<SourceTypeConfigMap[K][1]>, EnvSourceSchema<ZodObject, SourceTypeConfigMap[K][0]>]> } = {
    spotify: async () => {
        const {spotifySourceConfigSchema, spotifySourceAIOConfigSchema, envSchemas } = (await import('./spotify.ts'));
        return [spotifySourceConfigSchema, spotifySourceAIOConfigSchema, envSchemas]
    },
    plex: async () => {
        const {plexApiSourceConfigSchema, plexApiSourceAIOConfigSchema, envSchemas } = (await import('./plex.ts'));
        return [plexApiSourceConfigSchema, plexApiSourceAIOConfigSchema, envSchemas]
    },
    deezer: async () => {
        const {deezerInternalSourceConfigSchema, deezerInternalAIOConfigSchema, envSchemas } = (await import('./deezer.ts'));
        return [deezerInternalSourceConfigSchema, deezerInternalAIOConfigSchema, envSchemas]
    },
    endpointlz: async () => {
        const {listenbrainzEndpointSourceConfigSchema, listenbrainzEndpointSourceAIOConfigSchema, envSchemas } = (await import('./endpointlz.ts'));
        return [listenbrainzEndpointSourceConfigSchema, listenbrainzEndpointSourceAIOConfigSchema, envSchemas]
    },
    endpointlfm: async () => {
        const {lastFmEndpointSourceConfigSchema, lastFmEndpointSourceAIOConfigSchema, envSchemas } = (await import('./endpointlfm.ts'));
        return [lastFmEndpointSourceConfigSchema, lastFmEndpointSourceAIOConfigSchema, envSchemas]
    },
    icecast: async () => {
        const {icecastSourceConfigSchema, icecastSourceAIOConfigSchema, envSchemas } = (await import('./icecast.ts'));
        return [icecastSourceConfigSchema, icecastSourceAIOConfigSchema, envSchemas]
    },
    subsonic: async () => {
        const {subSonicSourceConfigSchema, subsonicSourceAIOConfigSchema, envSchemas } = (await import('./subsonic.ts'));
        return [subSonicSourceConfigSchema, subsonicSourceAIOConfigSchema, envSchemas]
    },
    jellyfin: async () => {
        const {jellyApiSourceConfigSchema, jellyApiSourceAIOConfigSchema, envSchemas } = (await import('./jellyfin.ts'));
        return [jellyApiSourceConfigSchema, jellyApiSourceAIOConfigSchema, envSchemas]
    },
    lastfm: async () => {
        const {lastfmSourceConfigSchema, lastFmSouceAIOConfigSchema, envSchemas } = (await import('./lastfm.ts'));
        return [lastfmSourceConfigSchema, lastFmSouceAIOConfigSchema, envSchemas]
    },
    librefm: async () => {
        const {librefmSourceConfigSchema, librefmSouceAIOConfigSchema, envSchemas } = (await import('./librefm.ts'));
        return [librefmSourceConfigSchema, librefmSouceAIOConfigSchema, envSchemas]
    },
    ytmusic: async () => {
        const {ytMusicSourceConfigSchema, ytMusicSourceAIOConfigSchema, envSchemas } = (await import('./ytmusic.ts'));
        return [ytMusicSourceConfigSchema, ytMusicSourceAIOConfigSchema, envSchemas]
    },
    ymbridge: async () => {
        const {yandexMusicBridgeSourceConfigSchema, yandexMusicBridgeSourceAIOConfigSchema, envSchemas } = (await import('./ymbridge.ts'));
        return [yandexMusicBridgeSourceConfigSchema, yandexMusicBridgeSourceAIOConfigSchema, envSchemas]
    },
    maloja: async () => {
        const {malojaSourceConfigSchema, malojaSourceAIOConfigSchema, envSchemas } = (await import('./maloja.ts'));
        return [malojaSourceConfigSchema, malojaSourceAIOConfigSchema, envSchemas]
    },
    mpris: async () => {
        const {mprisSourceConfigSchema, mprisSourceAIOConfigSchema, envSchemas } = (await import('./mpris.ts'));
        return [mprisSourceConfigSchema, mprisSourceAIOConfigSchema, envSchemas]
    },
    mopidy: async () => {
        const {mopidySourceConfigSchema, mopidySourceAIOConfigSchema, envSchemas } = (await import('./mopidy.ts'));
        return [mopidySourceConfigSchema, mopidySourceAIOConfigSchema, envSchemas]
    },
    listenbrainz: async () => {
        const {listenBrainzSourceConfigSchema, listenBrainzSourceAIOConfigSchema, envSchemas } = (await import('./listenbrainz.ts'));
        return [listenBrainzSourceConfigSchema, listenBrainzSourceAIOConfigSchema, envSchemas]
    },
    jriver: async () => {
        const {jRiverSourceConfigSchema, jRiverSourceAIOConfigSchema, envSchemas } = (await import('./jriver.ts'));
        return [jRiverSourceConfigSchema, jRiverSourceAIOConfigSchema, envSchemas]
    },
    kodi: async () => {
        const {kodiSourceConfigSchema, kodiSourceAIOConfigSchema, envSchemas } = (await import('./kodi.ts'));
        return [kodiSourceConfigSchema, kodiSourceAIOConfigSchema, envSchemas]
    },
    chromecast: async () => {
        const {chromecastSourceConfigSchema, chromecastSourceAIOConfigSchema, envSchemas } = (await import('./chromecast.ts'));
        return [chromecastSourceConfigSchema, chromecastSourceAIOConfigSchema, envSchemas]
    },
    webscrobbler: async () => {
        const {webScrobblerSourceConfigSchema, webScrobblerSourceAIOConfigSchema, envSchemas } = (await import('./webscrobbler.ts'));
        return [webScrobblerSourceConfigSchema, webScrobblerSourceAIOConfigSchema, envSchemas]
    },
    musikcube: async () => {
        const {musikcubeSourceConfigSchema, musikcubeSourceAIOConfigSchema, envSchemas } = (await import('./musikcube.ts'));
        return [musikcubeSourceConfigSchema, musikcubeSourceAIOConfigSchema, envSchemas]
    },
    musiccast: async () => {
        const {musicCastSourceConfigSchema, musicCastSourceAIOConfigSchema, envSchemas } = (await import('./musiccast.ts'));
        return [musicCastSourceConfigSchema, musicCastSourceAIOConfigSchema, envSchemas]
    },
    mpd: async () => {
        const {mpdSourceConfigSchema, mpdSourceAIOConfigSchema, envSchemas } = (await import('./mpd.ts'));
        return [mpdSourceConfigSchema, mpdSourceAIOConfigSchema, envSchemas]
    },
    vlc: async () => {
        const {vlcSourceConfigSchema, vlcSourceAIOConfigSchema, envSchemas } = (await import('./vlc.ts'));
        return [vlcSourceConfigSchema, vlcSourceAIOConfigSchema, envSchemas]
    },
    azuracast: async () => {
        const {azuracastSourceConfigSchema, azuracastSourceAIOConfigSchema, envSchemas } = (await import('./azuracast.ts'));
        return [azuracastSourceConfigSchema, azuracastSourceAIOConfigSchema, envSchemas]
    },
    koito: async () => {
        const {koitoSourceConfigSchema, koitoSourceAIOConfigSchema, envSchemas } = (await import('./koito.ts'));
        return [koitoSourceConfigSchema, koitoSourceAIOConfigSchema, envSchemas]
    },
    tealfm: async () => {
        const {tealSourceConfigSchema, tealSourceAIOConfigSchema, envSchemas } = (await import('./tealfm.ts'));
        return [tealSourceConfigSchema, tealSourceAIOConfigSchema, envSchemas]
    },
    rocksky: async () => {
        const {rockskySourceConfigSchema, rockskySourceAIOConfigSchema, envSchemas } = (await import('./rocksky.ts'));
        return [rockskySourceConfigSchema, rockskySourceAIOConfigSchema, envSchemas]
    },
    sonos: async () => {
        const {sonosSourceConfigSchema, sonosSourceAIOConfigSchema, envSchemas } = (await import('./sonos.ts'));
        return [sonosSourceConfigSchema, sonosSourceAIOConfigSchema, envSchemas]
    },
    applemusic: async () => {
        const {appleMusicSourceConfigSchema, appleMusicSourceAIOConfigSchema, envSchemas } = (await import('./applemusic.ts'));
        return [appleMusicSourceConfigSchema, appleMusicSourceAIOConfigSchema, envSchemas]
    },
};

export const validateSourceJson = async <T extends keyof SourceTypeConfigMap>(sourceType: T, json: object): Promise<SourceTypeConfigMap[T][0]> => {
    if(sourceConfigSchemaMapAsync[sourceType] === undefined) {
        throw new SimpleError(`No Source has a 'type' of '${sourceType}'`);
    }
    return (await sourceConfigSchemaMapAsync[sourceType]())[0].parse(json);
};
export const validateSourceAIOJson = async <T extends keyof SourceTypeConfigMap>(sourceType: T, json: object): Promise<SourceTypeConfigMap[T][1]> => {
    if(sourceConfigSchemaMapAsync[sourceType] === undefined) {
        throw new SimpleError(`No Source has a 'type' of '${sourceType}'`);
    }
    return (await sourceConfigSchemaMapAsync[sourceType]())[1].parse(json)
};

export const getSourceEnvSchema = async <T extends keyof SourceTypeConfigMap>(sourceType: T): Promise<EnvSourceSchema<ZodObject, SourceTypeConfigMap[T][0]>> => {
    if(sourceConfigSchemaMapAsync[sourceType] === undefined) {
        throw new SimpleError(`No Source has a 'type' of '${sourceType}'`);
    }
    return (await sourceConfigSchemaMapAsync[sourceType]())[2];
};