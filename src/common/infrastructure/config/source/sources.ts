import {SpotifySourceAIOConfig, SpotifySourceConfig} from "./spotify";
import {PlexSourceAIOConfig, PlexSourceConfig} from "./plex";
import {TautulliSourceAIOConfig, TautulliSourceConfig} from "./tautulli";
import {DeezerSourceAIOConfig, DeezerSourceConfig} from "./deezer";
import {SubsonicSourceAIOConfig, SubSonicSourceConfig} from "./subsonic";
import {JellySourceAIOConfig, JellySourceConfig} from "./jellyfin";
import {LastFmSouceAIOConfig, LastfmSourceConfig} from "./lastfm";

export type SourceConfig = SpotifySourceConfig | PlexSourceConfig | TautulliSourceConfig | DeezerSourceConfig | SubSonicSourceConfig | JellySourceConfig | LastfmSourceConfig;

export type SourceAIOConfig = SpotifySourceAIOConfig | PlexSourceAIOConfig | TautulliSourceAIOConfig | DeezerSourceAIOConfig | SubsonicSourceAIOConfig | JellySourceAIOConfig | LastFmSouceAIOConfig;
