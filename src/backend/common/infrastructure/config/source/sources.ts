import { SpotifySourceAIOConfig, SpotifySourceConfig } from "./spotify";
import { PlexSourceAIOConfig, PlexSourceConfig } from "./plex";
import { TautulliSourceAIOConfig, TautulliSourceConfig } from "./tautulli";
import { DeezerSourceAIOConfig, DeezerSourceConfig } from "./deezer";
import { SubsonicSourceAIOConfig, SubSonicSourceConfig } from "./subsonic";
import { JellySourceAIOConfig, JellySourceConfig } from "./jellyfin";
import { LastFmSouceAIOConfig, LastfmSourceConfig } from "./lastfm";
import { YTMusicSourceAIOConfig, YTMusicSourceConfig } from "./ytmusic";
import { MPRISSourceAIOConfig, MPRISSourceConfig } from "./mpris";
import { MopidySourceAIOConfig, MopidySourceConfig } from "./mopidy";
import { ListenBrainzSourceAIOConfig, ListenBrainzSourceConfig } from "./listenbrainz";
import { JRiverSourceAIOConfig, JRiverSourceConfig } from "./jriver";
import { KodiSourceAIOConfig, KodiSourceConfig } from "./kodi";

export type SourceConfig = SpotifySourceConfig | PlexSourceConfig | TautulliSourceConfig | DeezerSourceConfig | SubSonicSourceConfig | JellySourceConfig | LastfmSourceConfig | YTMusicSourceConfig | MPRISSourceConfig | MopidySourceConfig | ListenBrainzSourceConfig | JRiverSourceConfig | KodiSourceConfig;

export type SourceAIOConfig = SpotifySourceAIOConfig | PlexSourceAIOConfig | TautulliSourceAIOConfig | DeezerSourceAIOConfig | SubsonicSourceAIOConfig | JellySourceAIOConfig | LastFmSouceAIOConfig | YTMusicSourceAIOConfig | MPRISSourceAIOConfig | MopidySourceAIOConfig | ListenBrainzSourceAIOConfig | JRiverSourceAIOConfig | KodiSourceAIOConfig;
