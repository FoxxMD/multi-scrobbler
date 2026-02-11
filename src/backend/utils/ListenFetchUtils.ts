import { childLogger } from "@foxxmd/logging";
import dayjs from "dayjs";
import { PlayObject } from "../../core/Atomic.js";
import { hasPagelessTimeRangeListens, hasPaginatedTimeRangeListens, PagelessListensTimeRangeOptions, PagelessTimeRangeListens, PaginatedListensTimeRangeOptions, PaginatedTimeRangeCommonOptions, PaginatedTimeRangeListens, PaginatedTimeRangeSource, TimeRangeListensFetcher } from "../common/infrastructure/Atomic.js";
import { MaybeLogger } from "../common/logging.js";
import { sortByNewestPlayDate, sortByOldestPlayDate } from "../utils.js";
import { todayAwareFormat } from "./TimeUtils.js";

export const createGetScrobblesForTimeRangeFunc = <T extends PaginatedTimeRangeSource>(fetcher: T, pLogger: MaybeLogger = new MaybeLogger()): TimeRangeListensFetcher => {
    let requestCount: number;
    const logger = pLogger instanceof MaybeLogger ? pLogger : childLogger(pLogger, ['Pagination']);
    const reqLabel = () => `Request ${requestCount}`;
    const reqLogger = logger instanceof MaybeLogger ? pLogger : childLogger(logger, [reqLabel]);

    let plays: PlayObject[] = [];

    if (hasPagelessTimeRangeListens(fetcher)) {
        return async (opts: PaginatedTimeRangeCommonOptions): Promise<PlayObject[]> => {
            requestCount = 0;
            let more = true;
            let currOpts = { ...opts };
            let initial = true;
            while (more) {
                requestCount++;
                const reqOptsHint: string[] = [
                    `Between ${todayAwareFormat(dayjs(currOpts.from))} and ${todayAwareFormat(dayjs(currOpts.to))}`
                ];
                if(currOpts.to !== undefined && currOpts.from !== undefined) {
                    reqOptsHint.push(`Between ${todayAwareFormat(dayjs(currOpts.from))} and ${todayAwareFormat(dayjs(currOpts.to))}`);
                } else if(currOpts.to) {
                    reqOptsHint.push(`Until ${todayAwareFormat(dayjs(currOpts.to))}`);
                } else if(currOpts.to) {
                    reqOptsHint.push(`From ${todayAwareFormat(dayjs(currOpts.from))}`);
                }

                if(currOpts.limit !== undefined) {
                    reqOptsHint.push(`Limit ${currOpts.limit}`);
                }
                reqLogger.debug(`Fetching => ${reqOptsHint.join(' | ')}`);
                const results = await fetcher.getPagelessTimeRangeListens(currOpts);
                if(initial) {
                    initial = false;
                    const initialFetchLog = [];
                    if(results.meta.total !== undefined) {
                        initialFetchLog.push(`API reported ${results.meta.total} total results`);
                    }
                    if(results.meta.limit !== undefined && results.meta.limit !== currOpts.limit) {
                        initialFetchLog.push(`API reported new limit ${results.meta.limit}`);
                        currOpts.limit = results.meta.limit;
                    }
                    if(initialFetchLog.length > 0) {
                        logger.debug(initialFetchLog.join(' | '));
                    }
                }
                reqLogger.debug(`${results.data.length} results returned${results.data.length === 0 ? ', ending fetch' : ''}`);
                plays = plays.concat(results.data);
                if (!results.meta.more) {
                    logger.debug('API indicated no more results, ending fetch');
                    more = false;
                }
                if (results.data.length === 0) {
                    more = false;
                }
                // failsafe?
                if(more && results.meta.limit !== undefined && results.data.length < results.meta.limit) {
                    reqLogger.debug(`Number of returned results was less than reported/defined limit (${results.meta.limit}), ending fetch`);
                    more = false;
                }

                if(more && opts.to === undefined && opts.from === undefined) {
                    // only wanted one fetch
                    logger.debug('No to/from defined, ending fetch');
                    more = false;
                }

                if(more) {
                    if (results.meta.order === undefined || results.meta.order === 'asc') {
                        // if meta.order is ascending then assumption the response returns *oldest first* list
                        // so that the newest play from the response should be used as the new `from`
                        const nextFrom = [...results.data].sort(sortByNewestPlayDate)[0].data.playDate.unix() + 1;
                        currOpts.from = nextFrom;
                    } else {
                        // otherwise, oldest found play should be the new `to`
                        const nextTo = [...results.data].sort(sortByOldestPlayDate)[0].data.playDate.unix() - 1;
                        currOpts.to = nextTo;
                    }
                }
            }
            return plays;
        }
    } else if (hasPaginatedTimeRangeListens(fetcher)) {
        return async (opts: PaginatedTimeRangeCommonOptions | PaginatedListensTimeRangeOptions): Promise<PlayObject[]> => {
            requestCount = 0;
            let more = true;
            let currOpts: PaginatedListensTimeRangeOptions = { page: 1, ...opts };
            let initial = true;
            let timeRangeHint: string;
            if(currOpts.to !== undefined && currOpts.from !== undefined) {
                timeRangeHint = `Between ${todayAwareFormat(dayjs.unix(currOpts.from))} and ${todayAwareFormat(dayjs.unix(currOpts.to))}`;
            } else if(currOpts.to) {
                timeRangeHint= `Until ${todayAwareFormat(dayjs.unix(currOpts.to))}`;
            } else if(currOpts.to) {
                timeRangeHint = `From ${todayAwareFormat(dayjs.unix(currOpts.from))}`;
            }
            while (more) {
                requestCount++;
                const reqOptsHint: string[] = [
                    `Page ${currOpts.page}`
                ];
                if(timeRangeHint !== undefined) {
                    reqOptsHint.push(timeRangeHint);
                }
                if(currOpts.limit !== undefined) {
                    reqOptsHint.push(`Limit ${currOpts.limit}`);
                }
                reqLogger.debug(`Fetching => ${reqOptsHint.join(' | ')}`);
                const results = await fetcher.getPaginatedTimeRangeListens(currOpts);
                if(initial) {
                    initial = false;
                    const initialFetchLog = [];
                    if(results.meta.total !== undefined) {
                        initialFetchLog.push(`API reported ${results.meta.total} total results`);
                    }
                    if(results.meta.limit !== undefined && results.meta.limit !== currOpts.limit) {
                        initialFetchLog.push(`API reported new limit ${results.meta.limit}`);
                        currOpts.limit = results.meta.limit;
                    }
                    if(initialFetchLog.length > 0) {
                        logger.debug(initialFetchLog.join(' | '));
                    }
                }
                reqLogger.debug(`${results.data.length} results returned${results.data.length === 0 ? ', ending fetch' : ''}`);
                plays = plays.concat(results.data);
                if (!results.meta.more) {
                    logger.debug('API indicated no more results, ending fetch');
                    more = false;
                }
                if (results.data.length === 0) {
                    more = false;
                }
                // failsafe?
                if(more && results.meta.limit !== undefined && results.data.length < results.meta.limit) {
                    reqLogger.debug(`Number of returned results was less than reported/defined limit (${results.meta.limit}), ending fetch`);
                    more = false;
                }

                if(more && opts.to === undefined && opts.from === undefined) {
                    // only wanted one fetch
                    logger.debug('No to/from defined, ending fetch');
                    more = false;
                }

                if(more) {
                    currOpts.page++;
                }
            }
            return plays;
        }
    }

    throw new Error('fetcher does not implement pagination interface');
}