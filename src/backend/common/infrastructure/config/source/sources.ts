import { type AzuracastSourceAIOConfig, type AzuracastSourceConfig } from "./azuracast.ts";
import { type ChromecastSourceAIOConfig, type ChromecastSourceConfig } from "./chromecast.ts";
import { type ListenbrainzEndpointSourceAIOConfig, type ListenbrainzEndpointSourceConfig } from "./endpointlz.ts";
import { type LastFMEndpointSourceAIOConfig, type LastFMEndpointSourceConfig } from "./endpointlfm.ts";
import { type DeezerInternalSourceConfig, type DeezerInternalAIOConfig, type DeezerSourceAIOConfig, type DeezerSourceConfig, type DeezerCompatConfig, type DeezerAIOCompatConfig } from "./deezer.ts";
import { type JellyApiSourceAIOConfig, type JellyApiSourceConfig } from "./jellyfin.ts";
import { type JRiverSourceAIOConfig, type JRiverSourceConfig } from "./jriver.ts";
import { type KodiSourceAIOConfig, type KodiSourceConfig } from "./kodi.ts";
import { type LastFmSouceAIOConfig, type LastfmSourceConfig } from "./lastfm.ts";
import { type ListenBrainzSourceAIOConfig, type ListenBrainzSourceConfig } from "./listenbrainz.ts";
import { type MopidySourceAIOConfig, type MopidySourceConfig } from "./mopidy.ts";
import { type MPDSourceAIOConfig, type MPDSourceConfig } from "./mpd.ts";
import { type MPRISSourceAIOConfig, type MPRISSourceConfig } from "./mpris.ts";
import { type MusikcubeSourceAIOConfig, type MusikcubeSourceConfig } from "./musikcube.ts";
import { type MusicCastSourceConfig, type MusicCastSourceAIOConfig } from "./musiccast.ts";
import { type PlexApiSourceConfig, type PlexApiSourceAIOConfig } from "./plex.ts";
import { type SpotifySourceAIOConfig, type SpotifySourceConfig } from "./spotify.ts";
import { type SubsonicSourceAIOConfig, type SubSonicSourceConfig } from "./subsonic.ts";
import { type VLCSourceAIOConfig, type VLCSourceConfig } from "./vlc.ts";
import { type WebScrobblerSourceAIOConfig, type WebScrobblerSourceConfig } from "./webscrobbler.ts";
import { type YTMusicSourceAIOConfig, type YTMusicSourceConfig } from "./ytmusic.ts";
import { type YandexMusicBridgeSourceAIOConfig, type YandexMusicBridgeSourceConfig } from "./ymbridge.ts";
import { type IcecastSourceAIOConfig, type IcecastSourceConfig } from "./icecast.ts";
import { type KoitoSourceAIOConfig, type KoitoSourceConfig } from "./koito.ts";
import { type MalojaSourceAIOConfig, type MalojaSourceConfig } from "./maloja.ts";
import { type TealSourceAIOConfig, type TealSourceConfig } from "./tealfm.ts";
import { type RockskySourceAIOConfig, type RockskySourceConfig } from "./rocksky.ts";
import { type LibrefmSouceAIOConfig, type LibrefmSourceConfig } from "./librefm.ts";
import { type SonosSourceAIOConfig, type SonosSourceConfig } from "./sonos.ts";


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


export type SourceType =
    'spotify'
    | 'plex'
    | 'subsonic'
    | 'jellyfin'
    | 'lastfm'
    | 'librefm'
    | 'deezer'
    | 'endpointlz'
    | 'endpointlfm'
    | 'ytmusic'
    | 'ymbridge'
    | 'mpris'
    | 'mopidy'
    | 'musiccast'
    | 'listenbrainz'
    | 'jriver'
    | 'kodi'
    | 'webscrobbler'
    | 'chromecast'
    | 'maloja'
    | 'musikcube'
    | 'mpd'
    | 'vlc'
    | 'icecast'
    | 'azuracast'
    | 'koito'
    | 'tealfm'
    | 'rocksky'
    | 'sonos';
    
export const sourceTypes: SourceType[] = [
    'spotify',
    'plex',
    'subsonic',
    'jellyfin',
    'lastfm',
    'librefm',
    'deezer',
    'endpointlz',
    'endpointlfm',
    'ytmusic',
    'ymbridge',
    'mpris',
    'mopidy',
    'musiccast',
    'listenbrainz',
    'jriver',
    'kodi',
    'webscrobbler',
    'chromecast',
    'maloja',
    'musikcube',
    'mpd',
    'vlc',
    'icecast',
    'azuracast',
    'koito',
    'tealfm',
    'rocksky',
    'sonos'
];

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

export const isSourceType = (data: string): data is SourceType => {
    return sourceTypes.includes(data as SourceType);
};

