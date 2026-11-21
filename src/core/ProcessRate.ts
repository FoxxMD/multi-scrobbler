/** A reading of a running import or export, taken when a live update arrives */
export interface RateSample {
    at: number
    /** Plays processed so far */
    count: number
    /** Fraction done from 0 to 1, undefined when it can't be known */
    progress?: number
}

export interface RateEstimate {
    perMinute: number
    /** Unix ms when the process is expected to finish, undefined without a known progress */
    finishAt?: number
}

export const RATE_WINDOW_MS = 60_000;

/** Adds a sample and drops samples older than the window */
export const addRateSample = (samples: RateSample[], sample: RateSample, windowMs = RATE_WINDOW_MS): RateSample[] =>
    [...samples.filter(x => x.at >= sample.at - windowMs), sample];

/** Rate between the oldest and newest sample in the window, and the finish time that rate gives */
// shortcut: measured up to the newest update, so a stalled process keeps its last rate until the next update arrives, add a ticking clock if stalls confuse users
export const estimateRate = (samples: RateSample[]): RateEstimate | undefined => {
    if (samples.length < 2) {
        return undefined;
    }
    const first = samples[0];
    const last = samples[samples.length - 1];
    const elapsed = last.at - first.at;
    if (elapsed <= 0) {
        return undefined;
    }
    const estimate: RateEstimate = {perMinute: (last.count - first.count) / elapsed * 60_000};
    if (first.progress !== undefined && last.progress !== undefined && last.progress > first.progress) {
        estimate.finishAt = last.at + (1 - last.progress) / ((last.progress - first.progress) / elapsed);
    }
    return estimate;
}
