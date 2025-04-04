import { PlexSourceConfig } from "./plex.ts";

export interface TautulliSourceConfig extends PlexSourceConfig {
}

export interface TautulliSourceAIOConfig extends TautulliSourceConfig {
    type: 'tautulli'
}
