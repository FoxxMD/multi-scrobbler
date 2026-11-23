/** A service's rate limit as an export sees it */
export interface RateLimitStatusJson {
    limit: number
    remaining: number
    /** the export waits when `remaining` is this or lower */
    reserve: number
    /** epoch ms when the reported limit resets */
    reset: number
    /** `<limit>;w=<seconds>` */
    policy?: string
}

/** e.g. "3000;w=300" => "5 min" */
export const policyWindow = (policy?: string): string | undefined => {
    const secs = Number(policy?.match(/w=(\d+)/)?.[1]);
    if(!Number.isFinite(secs) || secs <= 0) {
        return undefined;
    }
    if(secs % 86400 === 0) return secs === 86400 ? 'day' : `${secs / 86400} days`;
    if(secs % 3600 === 0) return secs === 3600 ? 'hour' : `${secs / 3600} hours`;
    if(secs % 60 === 0) return `${secs / 60} min`;
    return `${secs}s`;
}
