import type {AzuracastSourceAIOConfig, AzuracastSourceConfig} from "./azuracast.ts";
import type {ChromecastSourceAIOConfig, ChromecastSourceConfig} from "./chromecast.ts";
import type {ListenbrainzEndpointSourceAIOConfig, ListenbrainzEndpointSourceConfig} from "./endpointlz.ts";
import type {LastFMEndpointSourceAIOConfig, LastFMEndpointSourceConfig} from "./endpointlfm.ts";
import type {DeezerInternalSourceConfig, DeezerSourceConfig, DeezerCompatConfig, DeezerAIOCompatConfig} from "./deezer.ts";
import type {JellyApiSourceAIOConfig, JellyApiSourceConfig} from "./jellyfin.ts";
import type {JRiverSourceAIOConfig, JRiverSourceConfig} from "./jriver.ts";
import type {KodiSourceAIOConfig, KodiSourceConfig} from "./kodi.ts";
import type {LastFmSouceAIOConfig, LastfmSourceConfig} from "./lastfm.ts";
import type {ListenBrainzSourceAIOConfig, ListenBrainzSourceConfig} from "./listenbrainz.ts";
import type {MopidySourceAIOConfig, MopidySourceConfig} from "./mopidy.ts";
import type {MPDSourceAIOConfig, MPDSourceConfig} from "./mpd.ts";
import type {MPRISSourceAIOConfig, MPRISSourceConfig} from "./mpris.ts";
import type {MusikcubeSourceAIOConfig, MusikcubeSourceConfig} from "./musikcube.ts";
import type {MusicCastSourceConfig, MusicCastSourceAIOConfig} from "./musiccast.ts";
import type {PlexApiSourceConfig, PlexApiSourceAIOConfig} from "./plex.ts";
import type {SpotifySourceAIOConfig, SpotifySourceConfig} from "./spotify.ts";
import type {SubsonicSourceAIOConfig, SubSonicSourceConfig} from "./subsonic.ts";
import type {VLCSourceAIOConfig, VLCSourceConfig} from "./vlc.ts";
import type {WebScrobblerSourceAIOConfig, WebScrobblerSourceConfig} from "./webscrobbler.ts";
import type {YTMusicSourceAIOConfig, YTMusicSourceConfig} from "./ytmusic.ts";
import type {YandexMusicBridgeSourceAIOConfig, YandexMusicBridgeSourceConfig} from "./ymbridge.ts";
import type {IcecastSourceAIOConfig, IcecastSourceConfig} from "./icecast.ts";
import type {KoitoSourceAIOConfig, KoitoSourceConfig} from "./koito.ts";
import type {MalojaSourceAIOConfig, MalojaSourceConfig} from "./maloja.ts";
import type {TealSourceAIOConfig, TealSourceConfig} from "./tealfm.ts";
import type {RockskySourceAIOConfig, RockskySourceConfig} from "./rocksky.ts";
import type {LibrefmSouceAIOConfig, LibrefmSourceConfig} from "./librefm.ts";
import type {SonosSourceAIOConfig, SonosSourceConfig} from "./sonos.ts";


export type SourceConfig =
    SpotifySourceConfig
    | PlexApiSourceConfig
    | DeezerCompatConfig
    | ListenbrainzEndpointSourceConfig
    | LastFMEndpointSourceConfig
    | SubSonicSourceConfig
    | JellyApiSourceConfig
    | LastfmSourceConfig
    | LibrefmSourceConfig
    | YTMusicSourceConfig
    | YandexMusicBridgeSourceConfig
    | MPRISSourceConfig
    | MopidySourceConfig
    | ListenBrainzSourceConfig
    | JRiverSourceConfig
    | KodiSourceConfig
    | WebScrobblerSourceConfig
    | ChromecastSourceConfig
    | MalojaSourceConfig
    | MusikcubeSourceConfig
    | MusicCastSourceConfig
    | MPDSourceConfig
    | VLCSourceConfig
    | IcecastSourceConfig
    | AzuracastSourceConfig
    | KoitoSourceConfig
    | TealSourceConfig
    | RockskySourceConfig
    | SonosSourceConfig;

export type SourceAIOConfig =
    SpotifySourceAIOConfig
    | PlexApiSourceAIOConfig
    | DeezerAIOCompatConfig
    | ListenbrainzEndpointSourceAIOConfig
    | LastFMEndpointSourceAIOConfig
    | SubsonicSourceAIOConfig
    | JellyApiSourceAIOConfig
    | LastFmSouceAIOConfig
    | LibrefmSouceAIOConfig
    | YTMusicSourceAIOConfig
    | YandexMusicBridgeSourceAIOConfig
    | MPRISSourceAIOConfig
    | MopidySourceAIOConfig
    | ListenBrainzSourceAIOConfig
    | JRiverSourceAIOConfig
    | KodiSourceAIOConfig
    | WebScrobblerSourceAIOConfig
    | ChromecastSourceAIOConfig
    | MalojaSourceAIOConfig
    | MusikcubeSourceAIOConfig
    | MusicCastSourceAIOConfig
    | MPDSourceAIOConfig
    | VLCSourceAIOConfig
    | IcecastSourceAIOConfig
    | AzuracastSourceAIOConfig
    | KoitoSourceAIOConfig
    | TealSourceAIOConfig
    | RockskySourceAIOConfig
    | SonosSourceAIOConfig;

/** Used for docusaurus schemas
 *  We need to show "array of" for each type of config when looking at File Config
 * 
 *  This is defined in the AIO config and we *assume* arrays in individual files when parsing in builders
 *  But we don't have any actual definitions for this that we can pull for generating individual schema files
 */
export type SpotifySourceConfigs = SpotifySourceConfig[];
export type PlexApiSourceConfigs = PlexApiSourceConfig[];
export type DeezerSourceConfigs = DeezerSourceConfig[];
export type DeezerInternalSourceConfigs = DeezerInternalSourceConfig[];
export type DeezerCompatConfigs = DeezerCompatConfig[];
export type ListenbrainzEndpointSourceConfigs = ListenbrainzEndpointSourceConfig[];
export type LastFMEndpointSourceConfigs = LastFMEndpointSourceConfig[];
export type SubSonicSourceConfigs = SubSonicSourceConfig[];
export type JellyApiSourceConfigs = JellyApiSourceConfig[];
export type LastfmSourceConfigs = LastfmSourceConfig[];
export type LibrefmSourceConfigs = LibrefmSourceConfig[];
export type YTMusicSourceConfigs = YTMusicSourceConfig[];
export type YandexMusicBridgeSourceConfigs = YandexMusicBridgeSourceConfig[];
export type MPRISSourceConfigs = MPRISSourceConfig[];
export type MopidySourceConfigs = MopidySourceConfig[];
export type ListenBrainzSourceConfigs = ListenBrainzSourceConfig[];
export type JRiverSourceConfigs = JRiverSourceConfig[];
export type KodiSourceConfigs = KodiSourceConfig[];
export type WebScrobblerSourceConfigs = WebScrobblerSourceConfig[];
export type ChromecastSourceConfigs = ChromecastSourceConfig[];
export type MalojaSourceConfigs = MalojaSourceConfig[];
export type MusikcubeSourceConfigs = MusikcubeSourceConfig[];
export type MusicCastSourceConfigs = MusicCastSourceConfig[];
export type MPDSourceConfigs = MPDSourceConfig[];
export type VLCSourceConfigs = VLCSourceConfig[];
export type IcecastSourceConfigs = IcecastSourceConfig[];
export type AzuracastSourceConfigs = AzuracastSourceConfig[];
export type KoitoSourceConfigs = KoitoSourceConfig[];
export type TealSourceConfigs = TealSourceConfig[];
export type RockskySourceConfigs = RockskySourceConfig[];
export type SonosSourceConfigs = SonosSourceConfig[];


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
    'SonosSourceConfig'
];

export const sourceInterfaces = [
    'AIOSourceRelaxedConfig',
    ...atomicSourceInterfaces
];


