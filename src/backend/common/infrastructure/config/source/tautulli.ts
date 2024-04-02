import { PlexSourceConfig } from "./plex.js";

export interface TautulliSourceConfig extends PlexSourceConfig {
}

export interface TautulliSourceAIOConfig extends TautulliSourceConfig {
    type: 'tautulli'
}
