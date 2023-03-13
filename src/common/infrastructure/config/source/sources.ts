import {SpotifySourceAIOConfig, SpotifySourceConfig} from "./spotify.js";
import {PlexSourceAIOConfig, PlexSourceConfig} from "./plex.js";
import {TautulliSourceAIOConfig, TautulliSourceConfig} from "./tautulli.js";
import {DeezerSourceAIOConfig, DeezerSourceConfig} from "./deezer.js";
import {SubsonicSourceAIOConfig, SubSonicSourceConfig} from "./subsonic.js";
import {JellySourceAIOConfig, JellySourceConfig} from "./jellyfin.js";
import {LastFmSouceAIOConfig, LastfmSourceConfig} from "./lastfm.js";
import {YTMusicSourceAIOConfig, YTMusicSourceConfig} from "./ytmusic.js";
import {MPRISSourceAIOConfig, MPRISSourceConfig} from "./mpris.js";
import {MopidySourceAIOConfig, MopidySourceConfig} from "./mopidy.js";
import {ListenBrainzSourceAIOConfig, ListenBrainzSourceConfig} from "./listenbrainz.js";
import {JRiverSourceAIOConfig, JRiverSourceConfig} from "./jriver.js";

export type SourceConfig = SpotifySourceConfig | PlexSourceConfig | TautulliSourceConfig | DeezerSourceConfig | SubSonicSourceConfig | JellySourceConfig | LastfmSourceConfig | YTMusicSourceConfig | MPRISSourceConfig | MopidySourceConfig | ListenBrainzSourceConfig | JRiverSourceConfig;

export type SourceAIOConfig = SpotifySourceAIOConfig | PlexSourceAIOConfig | TautulliSourceAIOConfig | DeezerSourceAIOConfig | SubsonicSourceAIOConfig | JellySourceAIOConfig | LastFmSouceAIOConfig | YTMusicSourceAIOConfig | MPRISSourceAIOConfig | MopidySourceAIOConfig | ListenBrainzSourceAIOConfig | JRiverSourceAIOConfig;
