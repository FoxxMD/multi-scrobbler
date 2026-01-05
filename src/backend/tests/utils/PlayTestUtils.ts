import { faker, fakerEL, FakerError } from '@faker-js/faker';
import dayjs, { Dayjs } from "dayjs";
import duration from "dayjs/plugin/duration.js";
import isBetween from "dayjs/plugin/isBetween.js";
import relativeTime from "dayjs/plugin/relativeTime.js";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import { FEAT, JOINERS, JOINERS_FINAL, JsonPlayObject, MissingMbidType, ObjectPlayData, PlayMeta, PlayObject } from "../../../core/Atomic.js";
import { sortByNewestPlayDate } from "../../utils.js";
import { NO_DEVICE, NO_USER, PlayerStateDataMaybePlay, PlayPlatformId, ReportedPlayerStatus } from '../../common/infrastructure/Atomic.js';
import { arrayListAnd } from '../../../core/StringUtils.js';
import { findDelimiters } from '../../utils/StringUtils.js';
import { TrackObject } from 'lastfm-node-client';
import { ListRecord, ScrobbleRecord } from '../../common/infrastructure/config/client/tealfm.js';
import { nanoid } from 'nanoid';

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

export const withBrainz = (play: PlayObject, include: ('track' | 'artist' | 'album')[]): PlayObject => {
    for(const i of include) {
        switch(i) {
            case 'track':
                if(play.data.meta?.brainz?.track === undefined) {
                    play.data.meta = {
                        ...(play.data.meta ?? {}),
                        brainz: {
                            ...(play.data.meta?.brainz ?? {}),
                            track: generateMbid()
                        }
                    }
                }
                break;
            case 'album':
                if(play.data.meta?.brainz?.album === undefined) {
                    play.data.meta = {
                        ...(play.data.meta ?? {}),
                        brainz: {
                            ...(play.data.meta?.brainz ?? {}),
                            album: generateMbid()
                        }
                    }
                }
                break;
            case 'artist':
                if(play.data.meta?.brainz?.artist === undefined) {
                    const artistMbids = play.data.artists.map(x => generateMbid());
                    play.data.meta = {
                        ...(play.data.meta ?? {}),
                        brainz: {
                            ...(play.data.meta?.brainz ?? {}),
                            artist: artistMbids
                        }
                    }
                }
                break;
        }
    }

    return play;
}

export const generatePlayPlatformId = (deviceId?: string, userId?: string): PlayPlatformId => {
    const did = deviceId ?? [NO_DEVICE, faker.hacker.noun(), faker.hacker.noun()][faker.number.int({min: 0, max: 2})];
    const uid = userId ?? [NO_USER, faker.internet.username(), faker.internet.username()][faker.number.int({min: 0, max: 2})];
    return [did, uid];
}

export const generatePlays = (numberOfPlays: number, data: ObjectPlayData = {}, meta: PlayMeta = {}): PlayObject[] => {
    return Array.from(Array(numberOfPlays), () => generatePlay(data, meta));
}

export const generateArtist = () => faker.music.artist;

export interface ArtistGenerationOptions
{
    ambiguousJoinedNames?: boolean, 
    trailingAmpersand?: boolean
}

export const generateArtists = (num?: number, max: number = 3, opts: ArtistGenerationOptions = {}) => {
    if(num === 0 || max === 0) {
        return [];
    }
    let artists = faker.helpers.multiple(faker.music.artist, {count: {min: num ?? 1, max: num ?? max}});

    const {
        trailingAmpersand = false,
        ambiguousJoinedNames = false
    } = opts;

    if(!trailingAmpersand) {
        // its really hard to parse an artist name that contains an '&' when it comes at the end of a list
        // because its ambigious if the list is joining the list with & or if & is part of the artist name
        // so by default don't generate these (we test for specific scenarios in playParsing.test.ts)
        while(artists[artists.length - 1].includes('&')) {
            artists = artists.slice(0, artists.length - 1).concat(faker.music.artist());
        }
    }
    if(!ambiguousJoinedNames) {
        artists = artists.map(x => {
            let a = x;
            let foundDelims = findDelimiters(a);
            while(foundDelims !== undefined && foundDelims.length > 0 && !(foundDelims.length === 1 && foundDelims[0] === '&')) {
                a = faker.music.artist();
                foundDelims = findDelimiters(a);
            }
            return a;
        });
    }
    return artists;
}

export interface ArtistGenerateOptions extends ArtistGenerationOptions {
    num?: number
    max?: number
    joiner?: string
    finalJoiner?: false | string
    spacedJoiners?: boolean
}

export interface SecondaryArtistGenerateOptions extends ArtistGenerateOptions {
    ft?: string
    ftWrap?: boolean
}

export interface CompoundArtistGenerateOptions {
    primary?: number | ArtistGenerateOptions
    secondary?: number | SecondaryArtistGenerateOptions
}

export const generateArtistsStr = (options: CompoundArtistGenerateOptions = {}): [string, string[], string[]] => {

    const {primary = {}, secondary = {}} = options;

    const primaryOpts: ArtistGenerateOptions = typeof primary === 'number' ? {num: primary} : primary;
    const secondaryOpts: SecondaryArtistGenerateOptions = typeof secondary === 'number' ? {num: secondary} : secondary;

    const primaryArt = generateArtists(primaryOpts.num, primaryOpts.max)
    const secondaryArt = generateArtists(secondaryOpts.num, secondaryOpts.max);


    const joinerPrimary: string = primaryOpts.joiner ?? faker.helpers.arrayElement(JOINERS);
    let finalJoinerPrimary: string = joinerPrimary;
    if(primaryOpts.finalJoiner !== false) {
        if(primaryOpts.finalJoiner === undefined) {
            if(joinerPrimary === ',' && !primaryArt.some(x => x.includes('&'))) {
                finalJoinerPrimary = faker.helpers.arrayElement(JOINERS_FINAL);
            }
        
        } else {
            finalJoinerPrimary = primaryOpts.finalJoiner;
        }
    }

    const primaryStr = arrayListAnd(primaryArt, joinerPrimary, finalJoinerPrimary, primaryOpts.spacedJoiners);

    if(secondaryArt.length === 0) {
        return [primaryStr, primaryArt, []];
    }

    const joinerSecondary: string = secondaryOpts.joiner ?? faker.helpers.arrayElement(JOINERS);
    let finalJoinerSecondary: string = joinerSecondary;
    if(secondaryOpts.finalJoiner !== false) {
        if(secondaryOpts.finalJoiner === undefined) {
            if(joinerSecondary === ',' && !secondaryArt.some(x => x.includes('&'))) {
                finalJoinerSecondary = faker.helpers.arrayElement(JOINERS_FINAL);
            }
        } else {
            finalJoinerSecondary = secondaryOpts.finalJoiner;
        }
    }

    const secondaryStr = arrayListAnd(secondaryArt, joinerSecondary, finalJoinerSecondary, secondaryOpts.spacedJoiners);
    const ft = secondaryOpts.ft ?? faker.helpers.arrayElement(FEAT);
    let sec = `${ft} ${secondaryStr}`;
    let wrap: boolean;
    if(secondaryOpts.ftWrap !== undefined) {
        wrap = secondaryOpts.ftWrap;
    } else {
        wrap = faker.datatype.boolean();
    }
    if(wrap) {
        sec = `(${sec})`;
    }
    const artistStr = `${primaryStr} ${sec}`;

    return [artistStr, primaryArt, secondaryArt];
}

export const generateLastfmTrackObject = (): TrackObject => {
    const now = dayjs();
    const artist = faker.music.artist();
    return {
        album: {
            '#text': faker.music.album(),
            mbid: ""
        },
        artist: {
            '#text': artist,
            mbid: "",
            name: artist
        },
        date: {
            uts: now.unix().toString(),
            '#text': now.format('DD MMM YYYY, HH:ss')
        },
        name: faker.music.songName(),
        url: "https://www.last.fm/music/test/_/test",
        '@attr': {
            nowplaying: 'false'
        },
        mbid: ""
    }
}

export const generateMbid = (): string => {
    return [
        faker.string.alphanumeric({length: 8}),
        faker.string.alphanumeric({length: 4}),
        faker.string.alphanumeric({length: 4}),
        faker.string.alphanumeric({length: 4}),
        faker.string.alphanumeric({length: 12})
    ].join('-')
}

export const generateTealPlayRecord = (opts: {
    withMbids?: boolean,
    withIsrc?: boolean
} = {}): [ListRecord<ScrobbleRecord>, { did: string, tid: string }] => {
    const {
        withMbids = true,
        withIsrc = true,
    } = opts;

    const now = dayjs();
    const artists = generateArtists(2);

    const did = nanoid(12);
    const tid = nanoid(10);

    const rec: ListRecord<ScrobbleRecord> = {
        uri: `at://did:plc:${did}/fm.teal.alpha.feed.play/${tid}`,
        cid: nanoid(12),
        value: {
            '$type': 'fm.teal.alpha.feed.play',
            artists: artists.map(x => withMbids ? { artistName: x, artistMbId: generateMbid() } : { artistName: x }),
            releaseName: faker.music.album(),
            trackName: faker.music.songName(),
            playedTime: now.toISOString(),
            submissionClientAgent: 'test',
            duration: faker.number.int({ min: 1, max: 300 })
        }
    }

    if (withMbids) {
        rec.value.releaseMbId = generateMbid();
        rec.value.recordingMbId = generateMbid();
    }

    if (withIsrc) {
        rec.value.isrc = nanoid(12);
    }

    return [rec, { did, tid }];
} 