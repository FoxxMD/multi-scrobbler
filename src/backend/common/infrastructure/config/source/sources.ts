import { ChromecastSourceAIOConfig, ChromecastSourceConfig } from "./chromecast.js";
import { DeezerSourceAIOConfig, DeezerSourceConfig } from "./deezer.js";
import { JellySourceAIOConfig, JellySourceConfig } from "./jellyfin.js";
import { JRiverSourceAIOConfig, JRiverSourceConfig } from "./jriver.js";
import { KodiSourceAIOConfig, KodiSourceConfig } from "./kodi.js";
import { LastFmSouceAIOConfig, LastfmSourceConfig } from "./lastfm.js";
import { ListenBrainzSourceAIOConfig, ListenBrainzSourceConfig } from "./listenbrainz.js";
import { MopidySourceAIOConfig, MopidySourceConfig } from "./mopidy.js";
import { MPDSourceAIOConfig, MPDSourceConfig } from "./mpd.js";
import { MPRISSourceAIOConfig, MPRISSourceConfig } from "./mpris.js";
import { MusikcubeSourceAIOConfig, MusikcubeSourceConfig } from "./musikcube.js";
import { PlexSourceAIOConfig, PlexSourceConfig } from "./plex.js";
import { SpotifySourceAIOConfig, SpotifySourceConfig } from "./spotify.js";
import { SubsonicSourceAIOConfig, SubSonicSourceConfig } from "./subsonic.js";
import { TautulliSourceAIOConfig, TautulliSourceConfig } from "./tautulli.js";
import { VLCSourceAIOConfig, VLCSourceConfig } from "./vlc.js";
import { WebScrobblerSourceAIOConfig, WebScrobblerSourceConfig } from "./webscrobbler.js";
import { YTMusicSourceAIOConfig, YTMusicSourceConfig } from "./ytmusic.js";


export type SourceConfig =
    SpotifySourceConfig
    | PlexSourceConfig
    | TautulliSourceConfig
    | DeezerSourceConfig
    | SubSonicSourceConfig
    | JellySourceConfig
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
    | MPDSourceConfig
    | VLCSourceConfig;

export type SourceAIOConfig =
    SpotifySourceAIOConfig
    | PlexSourceAIOConfig
    | TautulliSourceAIOConfig
    | DeezerSourceAIOConfig
    | SubsonicSourceAIOConfig
    | JellySourceAIOConfig
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
    | MPDSourceAIOConfig
    | VLCSourceAIOConfig;
