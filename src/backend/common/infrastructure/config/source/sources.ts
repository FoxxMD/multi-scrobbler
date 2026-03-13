import { AzuracastSourceAIOConfig, AzuracastSourceConfig } from "./azuracast.js";
import { ChromecastSourceAIOConfig, ChromecastSourceConfig } from "./chromecast.js";
import { ListenbrainzEndpointSourceAIOConfig, ListenbrainzEndpointSourceConfig } from "./endpointlz.js";
import { LastFMEndpointSourceAIOConfig, LastFMEndpointSourceConfig } from "./endpointlfm.js";
import { DeezerInternalSourceConfig, DeezerInternalAIOConfig, DeezerSourceAIOConfig, DeezerSourceConfig, DeezerCompatConfig } from "./deezer.js";
import { JellyApiSourceAIOConfig, JellyApiSourceConfig } from "./jellyfin.js";
import { JRiverSourceAIOConfig, JRiverSourceConfig } from "./jriver.js";
import { KodiSourceAIOConfig, KodiSourceConfig } from "./kodi.js";
import { LastFmSouceAIOConfig, LastfmSourceConfig } from "./lastfm.js";
import { ListenBrainzSourceAIOConfig, ListenBrainzSourceConfig } from "./listenbrainz.js";
import { MopidySourceAIOConfig, MopidySourceConfig } from "./mopidy.js";
import { MPDSourceAIOConfig, MPDSourceConfig } from "./mpd.js";
import { MPRISSourceAIOConfig, MPRISSourceConfig } from "./mpris.js";
import { MusikcubeSourceAIOConfig, MusikcubeSourceConfig } from "./musikcube.js";
import { MusicCastSourceConfig, MusicCastSourceAIOConfig } from "./musiccast.js";
import { PlexApiSourceConfig, PlexApiSourceAIOConfig } from "./plex.js";
import { SpotifySourceAIOConfig, SpotifySourceConfig } from "./spotify.js";
import { SubsonicSourceAIOConfig, SubSonicSourceConfig } from "./subsonic.js";
import { VLCSourceAIOConfig, VLCSourceConfig } from "./vlc.js";
import { WebScrobblerSourceAIOConfig, WebScrobblerSourceConfig } from "./webscrobbler.js";
import { YTMusicSourceAIOConfig, YTMusicSourceConfig } from "./ytmusic.js";
import { IcecastSourceAIOConfig, IcecastSourceConfig } from "./icecast.js";
import { KoitoSourceAIOConfig, KoitoSourceConfig } from "./koito.js";
import { MalojaSourceAIOConfig, MalojaSourceConfig } from "./maloja.js";
import { TealSourceAIOConfig, TealSourceConfig } from "./tealfm.js";
import { RockskySourceAIOConfig, RockskySourceConfig } from "./rocksky.js";
import { LibrefmSouceAIOConfig, LibrefmSourceConfig } from "./librefm.js";
import { SonosSourceAIOConfig, SonosSourceConfig } from "./sonos.js";


export type SourceConfig =
    SpotifySourceConfig
    | PlexApiSourceConfig
    | DeezerSourceConfig
    | DeezerInternalSourceConfig
    | ListenbrainzEndpointSourceConfig
    | LastFMEndpointSourceConfig
    | SubSonicSourceConfig
    | JellyApiSourceConfig
    | LastfmSourceConfig
    | LibrefmSourceConfig
    | YTMusicSourceConfig
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
    | DeezerSourceAIOConfig
    | DeezerInternalAIOConfig
    | ListenbrainzEndpointSourceAIOConfig
    | LastFMEndpointSourceAIOConfig
    | SubsonicSourceAIOConfig
    | JellyApiSourceAIOConfig
    | LastFmSouceAIOConfig
    | LibrefmSouceAIOConfig
    | YTMusicSourceAIOConfig
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

