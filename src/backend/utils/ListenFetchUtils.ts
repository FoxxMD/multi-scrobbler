import { childLogger, Logger, loggerTest } from "@foxxmd/logging";
import dayjs, { Dayjs } from "dayjs";
import { Duration } from "dayjs/plugin/duration.js";
import { PlayObject, UnixTimestamp } from "../../core/Atomic.js";
import { CursorType, hasPagelessTimeRangeListens, hasPaginatedTimeRangeListens, PagelessListensTimeRangeOptions, PagelessTimeRangeListens, PagelessTimeRangeListensResult, PaginatedListensTimeRangeOptions, PaginatedTimeRangeCommonOptions, PaginatedTimeRangeListens, PaginatedTimeRangeListensResult, PaginatedTimeRangeOptions, PaginatedTimeRangeSource, REFRESH_STALE_DEFAULT, TimeRangeListensFetcher } from "../common/infrastructure/Atomic.js";
import { loggerNoop, MaybeLogger } from "../common/logging.js";
import { sortByNewestPlayDate, sortByOldestPlayDate } from "../utils.js";
import { todayAwareFormat } from "./TimeUtils.js";
import { playDateWithinDurationOfAny } from "./PlayComparisonUtils.js";

export interface TimeRangeFetchOptions {
    logger?: MaybeLogger | Logger

}

export const createGetScrobblesForTimeRangeFunc = <T extends PaginatedTimeRangeSource>(fetcher: T, pLogger = loggerNoop): TimeRangeListensFetcher => {
    let requestCount: number;
    const logger = childLogger(pLogger, ['Pagination']); 
    const reqLabel = () => `Request ${requestCount}`;
    const reqLogger = childLogger(logger, [reqLabel]);
 
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
                let results: PagelessTimeRangeListensResult;
                try {
                    results = await fetcher.getPagelessTimeRangeListens(currOpts);
                } catch (e) {
                    throw new Error(`API error occurred on Request ${requestCount} with these parameters ${JSON.stringify(currOpts)}`, {cause: e});
                }
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
                reqLogger.trace(`${results.data.length} results returned${results.data.length === 0 ? ', ending fetch' : ''}`);
                plays = plays.concat(results.data);
                if (!results.meta.more) {
                    logger.trace('API indicated no more results, ending fetch');
                    more = false;
                }
                if (results.data.length === 0) {
                    more = false;
                }
                // failsafe?
                if(more && results.meta.limit !== undefined && results.data.length < results.meta.limit) {
                    reqLogger.trace(`Number of returned results was less than reported/defined limit (${results.meta.limit}), ending fetch`);
                    more = false;
                }

                if(more && opts.to === undefined && opts.from === undefined) {
                    // only wanted one fetch
                    logger.trace('No to/from defined, ending fetch');
                    more = false;
                }

                if(currOpts.fetchMax !== undefined && plays.length >= currOpts.fetchMax) {
                    logger.trace(`Total fetched (${plays.length}) is >= desired max (${currOpts.fetchMax}), ending fetch`);
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
        return async (opts: PaginatedListensTimeRangeOptions): Promise<PlayObject[]> => {
            requestCount = 0;
            let more = true;
            let currOpts: PaginatedListensTimeRangeOptions = opts;
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
                const reqOptsHint: string[] = [];
                if(currOpts.cursor !== undefined) {
                    `${typeof currOpts.cursor === 'number' ? 'Page' : 'Cursor'} ${currOpts.cursor}`;
                }
                if(timeRangeHint !== undefined) {
                    reqOptsHint.push(timeRangeHint);
                }
                if(currOpts.limit !== undefined) {
                    reqOptsHint.push(`Limit ${currOpts.limit}`);
                }
                reqLogger.debug(`Fetching => ${reqOptsHint.join(' | ')}`);
                let results: PaginatedTimeRangeListensResult<CursorType>;
                try {
                    results = await fetcher.getPaginatedTimeRangeListens(currOpts);
                } catch (e) {
                    throw new Error(`API error occurred on Request ${requestCount} with these parameters ${JSON.stringify(currOpts)}`, {cause: e});
                }
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
                    if(results.meta.cursor !== undefined && results.meta.cursor !== currOpts.cursor) {
                        initialFetchLog.push(`API reported new cursor ${results.meta.cursor}`);
                        currOpts.cursor = results.meta.cursor;
                    }
                    if(initialFetchLog.length > 0) {
                        logger.debug(initialFetchLog.join(' | '));
                    }
                }
                reqLogger.trace(`${results.data.length} results returned${results.data.length === 0 ? ', ending fetch' : ''}`);
                plays = plays.concat(results.data);
                if (!results.meta.more) {
                    logger.trace('API indicated no more results, ending fetch');
                    more = false;
                }
                if (results.data.length === 0) {
                    more = false;
                }
                // failsafe?
                if(more && results.meta.limit !== undefined && results.data.length < results.meta.limit) {
                    reqLogger.trace(`Number of returned results was less than reported/defined limit (${results.meta.limit}), ending fetch`);
                    more = false;
                }

                if(more && opts.to === undefined && opts.from === undefined) {
                    // only wanted one fetch
                    logger.trace('No to/from defined, ending fetch');
                    more = false;
                }

                if(currOpts.fetchMax !== undefined && plays.length >= currOpts.fetchMax) {
                    logger.trace(`Total fetched (${plays.length}) is >= desired max (${currOpts.fetchMax}), ending fetch`);
                    more = false;
                }

                if(more) {
                    if(results.meta.cursorNext !== undefined) {
                        currOpts.cursor = results.meta.cursorNext;
                    } else if(typeof currOpts.cursor === 'number') {
                        currOpts.cursor++;
                    } else {
                        throw new Error('Next cursor is not defined and current cursor is not a number, unable to determine how to increment pagination');
                    }
                }
            }
            return plays;
        }
    }

    throw new Error('fetcher does not implement pagination interface');
}

export interface GroupPlaysTimeRangeOptions {
    groupDuration?: Duration
    newPadding?: Duration
    staleNowBuffer?: number
    consolidateDuration?: Duration
    logger?: Logger
}

export const DEFAULT_GROUP_DURATION = dayjs.duration(15, 'm');
export const DEFAULT_NEW_PADDING = dayjs.duration(10, 'm');
export const DEFAULT_CONSOLIDATE_DURATION = dayjs.duration(3, 'h');

export const groupPlaysToTimeRanges = (plays: PlayObject[], existingRanges: PaginatedTimeRangeOptions[], opts: GroupPlaysTimeRangeOptions = {}) => {
    const {
        groupDuration = DEFAULT_GROUP_DURATION,
        newPadding = DEFAULT_NEW_PADDING,
        staleNowBuffer = REFRESH_STALE_DEFAULT,
        consolidateDuration = DEFAULT_CONSOLIDATE_DURATION,
        logger = loggerNoop
    } = opts;
    const newRanges: PaginatedTimeRangeOptions[] = [];

    const temporallyClosePlaySets: PlayObject[][] = [];

    const sorted = [...plays];
    sorted.sort(sortByOldestPlayDate);

    for(const p of sorted) {
        const closePlaySetIndex = temporallyClosePlaySets.findIndex(x => playDateWithinDurationOfAny(p, x, groupDuration));
        if(closePlaySetIndex === -1) {
            temporallyClosePlaySets.push([p]);
        } else {
            temporallyClosePlaySets[closePlaySetIndex].push(p);
        }
    }

    // make sure each grouped list is sorted
    temporallyClosePlaySets.forEach((x) => x.sort(sortByOldestPlayDate));
    // sort all lists so oldest list of plays is first
    temporallyClosePlaySets.sort((a, b) => {
    const aPlayDate = a[0].data.playDate;
    const bPlayDate = b[0].data.playDate;
        if(aPlayDate === undefined && bPlayDate === undefined) {
            return 0;
        }
        if(aPlayDate === undefined) {
            return 1;
        }
        if(bPlayDate === undefined) {
            return -1;
        }
        return aPlayDate.isAfter(bPlayDate) ? 1 : -1
    });

    // try to consolidate lists if they are within a few hours (or consolidateDuration) of their neighbors
    interface NeighorAcc {
        lists: PlayObject[][]
        open: PlayObject[] | undefined
    }
    let consolidated: PlayObject[][] = temporallyClosePlaySets;

    if(consolidated.length > 1) {
        consolidated = temporallyClosePlaySets.reduce((acc: NeighorAcc, curr, index) => {
            // if no list is currently being evaluated then open this one and iterate
            if(index === 0) {
                acc.open = curr;
                //return acc;
            } else {
                // if a list is open then we need to see if time b/w oldest and newest of curr is less than allowed time

                if(curr[curr.length - 1].data.playDate.diff(acc.open[0].data.playDate, 's') < consolidateDuration.asSeconds()) {
                    // if less than consolidateDuration then consolidate and iterate
                    acc.open = acc.open.concat(curr);
                    //return acc;
                } else {
                    // if its not less than consolidateDuration then close list
                    acc.lists.push(acc.open);

                    // and open with curr
                    acc.open = curr;
                }
            }

            if(index === temporallyClosePlaySets.length - 1) {
                // if this is the last iteration then push current as well
                acc.lists.push(acc.open)
            }

            return acc;
            

        }, {lists: [], open: undefined}).lists;
        logger.trace(`Reduced timerange groups ${temporallyClosePlaySets.length} => ${consolidated.length}`);
    }

    for(const tc of consolidated) {
        let oldest: Dayjs,
        newest: Dayjs;
        if(tc.length === 1) {
            oldest = tc[0].data.playDate;
            newest = oldest;
            //newest = tc[0].data.playDate.add(1, 'hour').unix();
        } else {
            oldest = tc[0].data.playDate;
            newest = tc[tc.length - 1].data.playDate;
        }

        let bufferedNewest = newest;
        if(dayjs().diff(bufferedNewest, 's') < staleNowBuffer) {
            bufferedNewest = bufferedNewest.subtract(staleNowBuffer, 's');
        }
        const existingWithin = existingRanges.find(x => x.from <= oldest.unix() && x.to >= bufferedNewest.unix());
        if(!existingWithin) {
            newRanges.push({from: oldest.subtract(newPadding).unix(), to: Math.min(newest.add(newPadding).unix(), dayjs().unix())});
        } else {
            newRanges.push(existingWithin);
        }
    }

    return newRanges;
}