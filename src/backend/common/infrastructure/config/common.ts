import { keyOmit, PlayTransformHooks, SearchAndReplaceTerm } from "../Atomic.js";

export interface CommonConfig {
    name?: string
    data?: CommonData
    /**
     * Should MS use this client/source? Defaults to true
     *
     * @default true
     * @examples [true]
     * */
    enable?: boolean
}

export type CommonData = keyOmit<{ [key: string]: any }, "options">

export interface RequestRetryOptions {
    /**
     * default # of http request retries a source/client can make before error is thrown
     *
     * @default 1
     * @examples [1]
     * */
    maxRequestRetries?: number
    /**
     * default retry delay multiplier (retry attempt * multiplier = # of seconds to wait before retrying)
     *
     * @default 1.5
     * @examples [1.5]
     * */
    retryMultiplier?: number
}

export interface PollingOptions {

    /**
     * How long to wait before polling the source API for new tracks (in seconds)
     *
     * @default 10
     * @examples [10]
     * */
    interval?: number

    /**
     * When there has been no new activity from the Source API multi-scrobbler will gradually increase the wait time between polling up to this value (in seconds)
     *
     * @default 30
     * @examples [30]
     * */
    maxInterval?: number
}

export type PlayTransformConfig = PlayTransformHooks<SearchAndReplaceTerm>;

export type PlayTransformOptions = PlayTransformConfig & { log?: boolean }
