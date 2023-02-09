export interface CommonConfig {
    name?: string
    data?: CommonData
}

export interface CommonData {
    [key: string]: any
    options?: Record<string, any>
}

export interface RequestRetryOptions {
    /**
     * default # of http request retries a source can make before error is thrown
     *
     * @default 1
     * */
    maxRequestRetries?: number
    /**
     * default retry delay multiplier (retry attempt * multiplier = # of seconds to wait before retrying)
     *
     * @default 1.5
     * */
    retryMultiplier?: number
}
