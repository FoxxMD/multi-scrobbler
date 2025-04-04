import { CommonSourceConfig, CommonSourceData, CommonSourceOptions, ManualListeningOptions } from "./index.ts";


export interface IcecastMetadata {
    icy?: {
        /** Title of the ICY metadata update, usually Artist - Title */
        StreamTitle?: string
        /** URL of the ICY metadata update, usually album art */
        StreamUrl?: string
    }
    ogg?: {
        /** Title of the OGG metadata update, usually Artist - Title */
        TITLE?: string
        ALBUM?: string
        ARTIST?: string
    }
}

export type IcecastSource = 'icy' | 'ogg' | 'icestats' | 'stats' | 'sevenhtml' | 'nextsongs';

export interface IcecastOptions {
    sources?: IcecastSource[]
    icestatsEndpoint?: string
    statsEndpoint?: string
    nextsongsEndpoint?: string
    sevenhtmlEndpoint?: string
    icyMetaInt?: number
}

export interface IcecastData extends CommonSourceData, IcecastOptions {
    /**
     * The Icecast stream URL
     * */
    url: string
}

export interface IcecastSourceOptions extends CommonSourceOptions, ManualListeningOptions {
}

export interface IcecastSourceConfig extends CommonSourceConfig {
    data: IcecastData
    options?: IcecastSourceOptions
}

export interface IcecastSourceAIOConfig extends IcecastSourceConfig {
    type: 'icecast'
}
