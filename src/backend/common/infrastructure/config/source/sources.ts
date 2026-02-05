import { AzuracastSourceAIOConfig, AzuracastSourceConfig } from "./azuracast.js";
import { ChromecastSourceAIOConfig, ChromecastSourceConfig } from "./chromecast.js";
import { ListenbrainzEndpointSourceAIOConfig, ListenbrainzEndpointSourceConfig } from "./endpointlz.js";
import { LastFMEndpointSourceAIOConfig, LastFMEndpointSourceConfig } from "./endpointlfm.js";
import { DeezerInternalSourceConfig, DeezerInternalAIOConfig, DeezerSourceAIOConfig, DeezerSourceConfig } from "./deezer.js";
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
import { AppleMusicAIOSourceConfig, AppleMusicSourceConfig } from "./apple.js";


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
    | SonosSourceConfig
    | AppleMusicSourceConfig;

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
    | SonosSourceAIOConfig
    | AppleMusicAIOSourceConfig;
