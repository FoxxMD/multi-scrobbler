import { AzuracastSourceAIOConfig, AzuracastSourceConfig } from "./azuracast.ts";
import { ChromecastSourceAIOConfig, ChromecastSourceConfig } from "./chromecast.ts";
import { ListenbrainzEndpointSourceAIOConfig, ListenbrainzEndpointSourceConfig } from "./endpointlz.ts";
import { LastFMEndpointSourceAIOConfig, LastFMEndpointSourceConfig } from "./endpointlfm.ts";
import { DeezerSourceAIOConfig, DeezerSourceConfig } from "./deezer.ts";
import { JellyApiSourceAIOConfig, JellyApiSourceConfig, JellySourceAIOConfig, JellySourceConfig } from "./jellyfin.ts";
import { JRiverSourceAIOConfig, JRiverSourceConfig } from "./jriver.ts";
import { KodiSourceAIOConfig, KodiSourceConfig } from "./kodi.ts";
import { LastFmSouceAIOConfig, LastfmSourceConfig } from "./lastfm.ts";
import { ListenBrainzSourceAIOConfig, ListenBrainzSourceConfig } from "./listenbrainz.ts";
import { MopidySourceAIOConfig, MopidySourceConfig } from "./mopidy.ts";
import { MPDSourceAIOConfig, MPDSourceConfig } from "./mpd.ts";
import { MPRISSourceAIOConfig, MPRISSourceConfig } from "./mpris.ts";
import { MusikcubeSourceAIOConfig, MusikcubeSourceConfig } from "./musikcube.ts";
import { MusicCastSourceConfig, MusicCastSourceAIOConfig } from "./musiccast.ts";
import { PlexSourceAIOConfig, PlexSourceConfig, PlexApiSourceConfig, PlexApiSourceAIOConfig } from "./plex.ts";
import { SpotifySourceAIOConfig, SpotifySourceConfig } from "./spotify.ts";
import { SubsonicSourceAIOConfig, SubSonicSourceConfig } from "./subsonic.ts";
import { TautulliSourceAIOConfig, TautulliSourceConfig } from "./tautulli.ts";
import { VLCSourceAIOConfig, VLCSourceConfig } from "./vlc.ts";
import { WebScrobblerSourceAIOConfig, WebScrobblerSourceConfig } from "./webscrobbler.ts";
import { YTMusicSourceAIOConfig, YTMusicSourceConfig } from "./ytmusic.ts";
import { IcecastSourceAIOConfig, IcecastSourceConfig } from "./icecast.ts";


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
    | VLCSourceConfig
    | IcecastSourceConfig
    | AzuracastSourceConfig;

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
    | VLCSourceAIOConfig
    | IcecastSourceAIOConfig
    | AzuracastSourceAIOConfig;
