import { faker } from '@faker-js/faker';
import dayjs, { Dayjs } from "dayjs";
import duration from "dayjs/plugin/duration.js";
import isBetween from "dayjs/plugin/isBetween.js";
import relativeTime from "dayjs/plugin/relativeTime.js";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import { JsonPlayObject, ObjectPlayData, PlayMeta, PlayObject } from "../../../core/Atomic.js";

dayjs.extend(utc)
dayjs.extend(isBetween);
dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(timezone);

export const asPlays = (data: object[]): PlayObject[] => {
    return data.map(x => {
        const y = x as JsonPlayObject;
        return {
            ...y,
            data: {
                ...y.data,
                playDate: dayjs(y.data.playDate)
            }
        }
    });
}

export const normalizePlays = (plays: PlayObject[],
                               options?: {
                                   initialDate?: Dayjs,
                                   defaultDuration?: number,
                                   defaultData?: ObjectPlayData,
                                   defaultMeta?: PlayMeta
                               }
): PlayObject[] => {
    const {
        initialDate,
        defaultDuration = 180,
        defaultData = {},
        defaultMeta = {}
    } = options || {};
    let date = initialDate;
    if (date === undefined) {
        const firstDatedPlay = plays.find(x => x.data.playDate !== undefined);
        if (firstDatedPlay !== undefined) {
            date = firstDatedPlay.data.playDate;
        } else {
            throw new Error('No initial date specified and no play had a defined date');
        }
    }
    let lastTrackEndsAt: Dayjs | undefined = undefined;
    const normalizedPlays: PlayObject[] = [];

    for (const play of plays) {

        const cleanPlay = {...play};

        if (lastTrackEndsAt === undefined) {
            // first track
            cleanPlay.data.playDate = date;
        } else {
            cleanPlay.data.playDate = lastTrackEndsAt.add(1, 'second');
        }
        cleanPlay.data = {
            ...cleanPlay.data,
            ...defaultData
        }
        cleanPlay.meta = {
            ...cleanPlay.meta,
            ...defaultMeta
        }
        lastTrackEndsAt = cleanPlay.data.playDate.add(cleanPlay.data.duration ?? defaultDuration, 'seconds');
        normalizedPlays.push(cleanPlay);
    }

    return normalizedPlays;
}

export const generatePlay = (data: ObjectPlayData = {}, meta: PlayMeta = {}): PlayObject => {
    return {
        data: {
            track: faker.music.songName(),
            artists: faker.helpers.multiple(faker.music.artist, {count: {min: 1, max: 3}}),
            duration: faker.number.int({min: 30, max: 300}),
            playDate: dayjs().subtract(faker.number.int({min: 1, max: 800})),
            album: faker.music.album(),
            ...data
        },
        meta: {
            source: ['Spotify', 'Listenbrainz', 'Lastfm', 'Jellyfin', 'Plex'][faker.number.int({min: 0, max: 4})],
            ...meta,
        }
    }
}

export const generatePlays = (numberOfPlays: number, data: ObjectPlayData = {}, meta: PlayMeta = {}): PlayObject[] => {
    return Array.from(Array(numberOfPlays), () => generatePlay(data, meta));
}
