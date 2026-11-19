/**
 * Status of a job process (import, or export to one target).
 *
 * `paused` and `stopped` behave the same (halted, cursor kept, Start resumes) and only differ for display.
 * */
export const JOB_PROCESS_STATUSES = ['idle', 'running', 'paused', 'stopped', 'failed', 'completed'] as const;
export type JobProcessStatus = typeof JOB_PROCESS_STATUSES[number];

export const LASTFM_FILE_FORMATS = ['lastfm-ghan-json', 'lastfm-ghan-csv', 'lastfm-benjamin-csv'] as const;
export type LastfmFileFormat = typeof LASTFM_FILE_FORMATS[number];
