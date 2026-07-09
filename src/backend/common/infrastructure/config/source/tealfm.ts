import { type TealData, type TealOptions } from "../client/tealfm.ts"
import { type PollingOptions } from "../common.ts"
import { type CommonSourceConfig, type CommonSourceData, type CommonSourceOptions } from "./index.ts"


export interface TealSourceData extends TealData, CommonSourceData, PollingOptions {
    serviceAllow?: string[]
    serviceDeny?: string[]
}

export interface TealSourceConfig extends CommonSourceConfig {
    /**
     * Should always be `souce` when using Tealfm as a Source
     *
     * @default source
     * @examples ["source"]
     * */
    configureAs: 'source'
    data: TealSourceData
    options?: TealSourceOptions
}

export interface TealSourceOptions extends CommonSourceOptions, TealOptions {
}

export interface TealSourceAIOConfig extends TealSourceConfig {
    type: 'tealfm'
}