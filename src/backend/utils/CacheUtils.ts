import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import isToday from 'dayjs/plugin/isToday.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { AmbPlayObject, ListenRangeData, ListenRangeDataAmb, PlayObject, PlayProgress, PlayProgressAmb } from '../../core/Atomic.js';

dayjs.extend(utc)
dayjs.extend(isBetween);
dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(timezone);
dayjs.extend(isToday);

export const rehydratePlay = (obj: AmbPlayObject): PlayObject => {
    if(obj.data?.playDate !== undefined && typeof obj.data.playDate === 'string') {
        obj.data.playDate = dayjs(obj.data.playDate);
        if(obj.data.playDateCompleted !== undefined) {
            obj.data.playDateCompleted = dayjs(obj.data.playDateCompleted);
        }
    
        if(obj.data.listenRanges !== undefined) {
            obj.data.listenRanges = obj.data.listenRanges.map(rehydrateListenRangeData);
        }
    }
    return obj as PlayObject;
}

// this may become problematic since we aren't re-instantiating Progress class, just implementing interface
// but that may only be an issue if rehydrating source data which isn't in scope so far
export const rehydrateListenRangeData = (obj: ListenRangeDataAmb): ListenRangeData => {
    return {
        start: rehydratePlayProgress(obj.start),
        end: rehydratePlayProgress(obj.end)
    } as ListenRangeData;
}

export const rehydratePlayProgress = (obj: PlayProgressAmb): PlayProgress => {
    if(typeof obj.timestamp === 'string') {
        obj.timestamp = dayjs(obj.timestamp);
    }
    return obj as PlayProgress;
}