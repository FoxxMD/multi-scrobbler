import { PlexSourceConfig } from "./plex";

export interface TautulliSourceConfig extends PlexSourceConfig {
}

export interface TautulliSourceAIOConfig extends TautulliSourceConfig {
    type: 'tautulli'
}
