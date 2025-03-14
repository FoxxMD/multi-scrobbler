import { ChromecastSourceAIOConfig, ChromecastSourceConfig } from "./chromecast.js";
import { ListenbrainzEndpointSourceAIOConfig, ListenbrainzEndpointSourceConfig } from "./endpointlz.js";
import { LastFMEndpointSourceAIOConfig, LastFMEndpointSourceConfig } from "./endpointlfm.js";
import { DeezerSourceAIOConfig, DeezerSourceConfig } from "./deezer.js";
import { JellyApiSourceAIOConfig, JellyApiSourceConfig, JellySourceAIOConfig, JellySourceConfig } from "./jellyfin.js";
import { JRiverSourceAIOConfig, JRiverSourceConfig } from "./jriver.js";
import { KodiSourceAIOConfig, KodiSourceConfig } from "./kodi.js";
import { LastFmSouceAIOConfig, LastfmSourceConfig } from "./lastfm.js";
import { ListenBrainzSourceAIOConfig, ListenBrainzSourceConfig } from "./listenbrainz.js";
import { MopidySourceAIOConfig, MopidySourceConfig } from "./mopidy.js";
import { MPDSourceAIOConfig, MPDSourceConfig } from "./mpd.js";
import { MPRISSourceAIOConfig, MPRISSourceConfig } from "./mpris.js";
import { MusikcubeSourceAIOConfig, MusikcubeSourceConfig } from "./musikcube.js";
import { MusicCastSourceConfig, MusicCastSourceAIOConfig } from "./musiccast.js";
import { PlexSourceAIOConfig, PlexSourceConfig, PlexApiSourceConfig, PlexApiSourceAIOConfig } from "./plex.js";
import { SpotifySourceAIOConfig, SpotifySourceConfig } from "./spotify.js";
import { SubsonicSourceAIOConfig, SubSonicSourceConfig } from "./subsonic.js";
import { TautulliSourceAIOConfig, TautulliSourceConfig } from "./tautulli.js";
import { VLCSourceAIOConfig, VLCSourceConfig } from "./vlc.js";
import { WebScrobblerSourceAIOConfig, WebScrobblerSourceConfig } from "./webscrobbler.js";
import { YTMusicSourceAIOConfig, YTMusicSourceConfig } from "./ytmusic.js";


export type SourceConfig =
    SpotifySourceConfig
    | PlexSourceConfig
    | PlexApiSourceConfig
    | TautulliSourceConfig
    | DeezerSourceConfig
    | ListenbrainzEndpointSourceConfig
    | LastFMEndpointSourceConfig
    | SubSonicSourceConfig
    | JellySourceConfig
    | JellyApiSourceConfig
    | LastfmSourceConfig
    | YTMusicSourceConfig
    | MPRISSourceConfig
    | MopidySourceConfig
    | ListenBrainzSourceConfig
    | JRiverSourceConfig
    | KodiSourceConfig
    | WebScrobblerSourceConfig
    | ChromecastSourceConfig
    | MusikcubeSourceConfig
    | MusicCastSourceConfig
    | MPDSourceConfig
    | VLCSourceConfig;

export type SourceAIOConfig =
    SpotifySourceAIOConfig
    | PlexSourceAIOConfig
    | PlexApiSourceAIOConfig
    | TautulliSourceAIOConfig
    | DeezerSourceAIOConfig
    | ListenbrainzEndpointSourceAIOConfig
    | LastFMEndpointSourceAIOConfig
    | SubsonicSourceAIOConfig
    | JellySourceAIOConfig
    | JellyApiSourceAIOConfig
    | LastFmSouceAIOConfig
    | YTMusicSourceAIOConfig
    | MPRISSourceAIOConfig
    | MopidySourceAIOConfig
    | ListenBrainzSourceAIOConfig
    | JRiverSourceAIOConfig
    | KodiSourceAIOConfig
    | WebScrobblerSourceAIOConfig
    | ChromecastSourceAIOConfig
    | MusikcubeSourceAIOConfig
    | MusicCastSourceAIOConfig
    | MPDSourceAIOConfig
    | VLCSourceAIOConfig;
