export interface JobTimings {
    /** wait between import pages, to be gentle with upstream rate limits */
    importPageDelay: number
    /** job-level retries for a failed import fetch, on top of any retries the api client does */
    importRetries: number
    /** first retry delay, doubles each attempt */
    importRetryBase: number
    /** how long to wait for the upstream component to become ready before counting it as a failed attempt */
    readyTimeout: number
    readyPoll: number
    /** min time between jobUpdate events for one job */
    emitThrottle: number
    /** export fallback poll, when no client or import event wakes it sooner */
    exportPoll: number
}

export const DEFAULT_JOB_TIMINGS: JobTimings = {
    importPageDelay: 1000,
    importRetries: 3,
    importRetryBase: 15000,
    readyTimeout: 120000,
    readyPoll: 5000,
    emitThrottle: 1000,
    exportPoll: 5000,
};
