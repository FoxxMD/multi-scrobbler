import { faker } from '@faker-js/faker';
import dayjs, { Dayjs } from "dayjs";
import duration from "dayjs/plugin/duration.js";
import isBetween from "dayjs/plugin/isBetween.js";
import relativeTime from "dayjs/plugin/relativeTime.js";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import { JsonPlayObject, ObjectPlayData, PlayMeta, PlayObject } from "../../../core/Atomic.js";
import { sortByNewestPlayDate } from "../../utils.js";
import { NO_DEVICE, NO_USER, PlayerStateDataMaybePlay, PlayPlatformId, ReportedPlayerStatus } from '../../common/infrastructure/Atomic.js';

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
                                   //sortFunc?: (a: PlayObject, b: PlayObject) => 0 | 1 | -1
                                   initialDate?: Dayjs,
                                   endDate?: Dayjs
                                   defaultDuration?: number,
                                   defaultData?: ObjectPlayData,
                                   defaultMeta?: PlayMeta
                               }
): PlayObject[] => {
    const {
        initialDate,
        endDate,
        defaultDuration = 180,
        defaultData = {},
        defaultMeta = {},
        //sortFunc = sortByNewestPlayDate
    } = options || {};

    const normalizedPlays: PlayObject[] = [];

    let actualInitialDate: Dayjs | undefined = initialDate;

    if(endDate !== undefined && actualInitialDate !== undefined) {

        // need to redefine durations and listenedFor, if present
        const dur = dayjs.duration(endDate.diff(actualInitialDate));
        let remaining = plays.length;

        let index = 0;
        let lastDate = endDate;
        let remainingTime = dur.asSeconds()
        for(const play of plays) {

            const cleanPlay = {...play};

            const remainingAvgTime = remainingTime/remaining;
            cleanPlay.data.playDate = lastDate;
            cleanPlay.data.duration = faker.number.int({min: 30, max: remainingAvgTime});
            if(cleanPlay.data.listenedFor !== undefined) {
                cleanPlay.data.listenedFor = faker.number.int({min: Math.floor(cleanPlay.data.duration * 0.9), max: cleanPlay.data.duration});
            }
            cleanPlay.data = {
                ...cleanPlay.data,
                ...defaultData
            }
            cleanPlay.meta = {
                ...cleanPlay.meta,
                ...defaultMeta
            }

            if(index + 1 <= plays.length - 1) {
                const listenTime = (plays[index+1].data.duration ?? defaultDuration) + faker.number.int({min: 0, max: 2});
                lastDate = cleanPlay.data.playDate.subtract(listenTime, 'seconds');
            }
            remaining--;
            remainingTime -= cleanPlay.data.duration;
            index++;
        }

    } else {
        const progressDirection: 'newer' | 'older' = endDate !== undefined ? 'older' : 'newer';
        if(progressDirection === 'newer' && actualInitialDate === undefined) {
            const firstDatedPlay = plays.find(x => x.data.playDate !== undefined);
            if (firstDatedPlay !== undefined) {
                actualInitialDate = firstDatedPlay.data.playDate;
            } else {
                throw new Error('No initial date specified and no play had a defined date');
            }
        }

        let lastDate: Dayjs = progressDirection === 'newer' ? actualInitialDate : endDate;
        let index = 0;
        for (const play of plays) {

            const cleanPlay = {...play};

            cleanPlay.data.playDate = lastDate;
            cleanPlay.data = {
                ...cleanPlay.data,
                ...defaultData
            }
            cleanPlay.meta = {
                ...cleanPlay.meta,
                ...defaultMeta
            }

            if(progressDirection === 'newer') {
                const listenTime = (cleanPlay.data.duration ?? defaultDuration) + faker.number.int({min: 0, max: 2});
                lastDate = cleanPlay.data.playDate.add(listenTime, 'seconds');
            } else if(index + 1 <= plays.length - 1) {
                const listenTime = (plays[index+1].data.duration ?? defaultDuration) + faker.number.int({min: 0, max: 2});
                lastDate = cleanPlay.data.playDate.subtract(listenTime, 'seconds');
            }

            normalizedPlays.push(cleanPlay);
            index++;
        }

        if(progressDirection === 'older') {
            normalizedPlays.sort(sortByNewestPlayDate);
        }
    }

    return normalizedPlays;
}

export const generatePlayerStateData = (options: Omit<PlayerStateDataMaybePlay, 'platformId'> & {playData?: ObjectPlayData, playMeta?: PlayMeta, platformId?: PlayPlatformId} = {}): PlayerStateDataMaybePlay => {
    let play: PlayObject = options.play ?? generatePlay(options.playData, options.playMeta);
    if(options.position !== undefined) {
        play.meta.trackProgressPosition = options.position;
    }
    return {
        platformId: options.platformId ?? [NO_DEVICE, NO_USER],
        sessionId: options.sessionId,
        play,
        status: options.status,
        position: options.position,
        timestamp: options.timestamp ?? dayjs()
    }
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
