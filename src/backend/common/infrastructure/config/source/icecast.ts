import { CommonSourceConfig, CommonSourceData } from "./index.js";


export interface IcecastMetadata {
    /** Title of the ICY metadata update, usually Artist - Title */
    StreamTitle?: string
    /** URL of the ICY metadata update, usually album art */
    StreamUrl?: string
    /** Title of the OGG metadata update, usually Artist - Title */
    TITLE?: string
}

export interface IcecastMetadataResponse {
    metadata: IcecastMetadata
    stats: {
        [key:string]: number
    }
}

export interface IcecastData extends CommonSourceData {
    /**
     * The Icecast stream URL
     * */
    url: string
}

export interface IcecastSourceConfig extends CommonSourceConfig {
    data: IcecastData
}

export interface IcecastSourceAIOConfig extends IcecastSourceConfig {
    type: 'icecast'
}
