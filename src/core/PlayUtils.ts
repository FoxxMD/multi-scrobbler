import { PlayPlatformId } from "../backend/common/infrastructure/Atomic.js";
import { PlayObject, PlayObjectLifecycleless } from "./Atomic.js";


/** sorts playObj formatted objects by playDate in descending (newest first) order */
export const sortByNewestPlayDate = (a: PlayObject, b: PlayObject) => {
    const {
        data: {
            playDate: aPlayDate
        } = {}
    } = a;
    const {
        data: {
            playDate: bPlayDate
        } = {}
    } = b;
    if (aPlayDate === undefined && bPlayDate === undefined) {
        return 0;
    }
    if (aPlayDate === undefined) {
        return 1;
    }
    if (bPlayDate === undefined) {
        return -1;
    }
    return aPlayDate.isBefore(bPlayDate) ? 1 : -1;
};export const genGroupIdStr = (id: PlayPlatformId) => {
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

