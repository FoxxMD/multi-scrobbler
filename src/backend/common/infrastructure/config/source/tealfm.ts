import { TealData, TealOptions } from "../client/tealfm.js"
import { PollingOptions } from "../common.js"
import { CommonSourceConfig, CommonSourceData, CommonSourceOptions } from "./index.js"


export interface TealSourceData extends TealData, CommonSourceData, PollingOptions {

}

export interface TealSourceConfig extends CommonSourceConfig {
    /**
     * Should always be `souce` when using Tealfm as a Source
     *
     * @default source
     * @examples ["source"]
     * */
    configureAs?: 'source'
    data: TealSourceData
    options?: TealSourceOptions
}

export interface TealSourceOptions extends CommonSourceOptions, TealOptions {
}

export interface TealSourceAIOConfig extends TealSourceConfig {
    type: 'tealfm'
}