import { PlayPlatformId } from "../backend/common/infrastructure/Atomic.js";
import { AmbPlayObject, DateLike, PlayObject, PlayObjectLifecycleless } from "./Atomic.js";
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

export const lifecyclelessInvariantTransform = (play: PlayObject): PlayObjectLifecycleless => {
    const {
        meta: {
            lifecycle, ...rest
        } = {},
    } = play;
    return {
        ...play,
        meta: {
            ...rest
        }
    };
};

