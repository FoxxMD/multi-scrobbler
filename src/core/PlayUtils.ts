import { parseRegexSingle } from "@foxxmd/regex-buddy-core";
import type {AmbPlayObject, DateLike, PlayObject, PlayObjectMinimal, PlayPlatformId} from "./Atomic.ts";
import dayjs from "dayjs";

export const sortByNewestDate = (aPlayDate: DateLike, bPlayDate: DateLike) => {
    if (aPlayDate === undefined && bPlayDate === undefined) {
        return 0;
    }
    if (aPlayDate === undefined) {
        return 1;
    }
    if (bPlayDate === undefined) {
        return -1;
    }
    
    const realA = typeof aPlayDate === 'string' ? dayjs(aPlayDate) : aPlayDate;
    const realB = typeof bPlayDate === 'string' ? dayjs(bPlayDate) : bPlayDate;
    return realA.isBefore(realB) ? 1 : -1;
};

/** sorts playObj formatted objects by playDate in descending (newest first) order */
export const sortByNewestPlayDateAccessor = (accessor: (play: AmbPlayObject<DateLike>) => DateLike) => (a: AmbPlayObject<DateLike>, b: AmbPlayObject<DateLike>) => {
    const aPlayDate = accessor(a);
    const bPlayDate = accessor(b);
    return sortByNewestDate(aPlayDate, bPlayDate);
};


/** sorts playObj formatted objects by playDate in descending (newest first) order */
export const sortByNewestPlayDate = sortByNewestPlayDateAccessor((play) => play.data?.playDate);

/** sorts playObj formatted objects by playDate in descending (newest first) order */
export const sortByNewestSeenDate = sortByNewestPlayDateAccessor((play) => play.meta?.seenAt);

export const genGroupIdStr = (id: PlayPlatformId) => {
    return `${id[0]}-${id[1]}`;
};

export const statefulInvariantTransform = (play: PlayObject, withIds?: boolean): PlayObjectMinimal => {
    const {
        meta,
        data,
        id,
        uid
    } = play;
    if(withIds) {
        return {
            data,
            meta,
            uid,
            id
        }
    }
    return {
        data,
        meta
    };
};

export const REGEX_ISRC_NO_HYPHENS = new RegExp(/^(?<cc>[\d\w]{2})(?<registrant>[\d\w]{3})(?<year>\d{2})(?<designation>\d{5})$/);
export const REGEX_ISRC_HYPHENS = new RegExp(/^(?<cc>[\d\w]{2})-(?<registrant>[\d\w]{3})-(?<year>\d{2})-(?<designation>\d{5})$/);

/**
 * Removes hyphens from ISRC identifiers
 * 
 * ISRC identifiers officially use hyphens but it is valid to use them without
 * and some systems expect no hyphens (musicbrainz)
 * 
 * @see https://en.wikipedia.org/wiki/International_Standard_Recording_Code
 * @see https://isrctools.com/format/
 */
export const isrcNoHyphens = (isrc: string): string => {
    const parsed = parseRegexSingle(REGEX_ISRC_HYPHENS, isrc);
    if(parsed === undefined) {
        // check if its already parsed
        const alreadyOk = REGEX_ISRC_NO_HYPHENS.test(isrc);
        if(alreadyOk) {
            return isrc;
        }
        throw new Error(`Value ${isrc} is not a valid ISRC`);
    }
    return `${parsed.named.cc}${parsed.named.registrant}${parsed.named.year}${parsed.named.designation}`;
}

/**
 * Add hyphens to ISRC identifiers
 * 
 * ISRC identifiers officially use hyphens but it is valid to use them without
 * and some systems expect no hyphens (musicbrainz).
 * 
 * This function re-adds hyphens to an isrc value if they are not present
 * 
 * @see https://en.wikipedia.org/wiki/International_Standard_Recording_Code
 * @see https://isrctools.com/format/
 * 
 */
export const isrcWithHyphens = (isrc: string): string => {
    const parsed = parseRegexSingle(REGEX_ISRC_NO_HYPHENS, isrc);
    if(parsed === undefined) {
        // check if its already parsed
        const alreadyOk = REGEX_ISRC_HYPHENS.test(isrc);
        if(alreadyOk) {
            return isrc;
        }
        throw new Error(`Value ${isrc} is not a valid ISRC`);
    }
    return `${parsed.named.cc}-${parsed.named.registrant}-${parsed.named.year}-${parsed.named.designation}`;
}