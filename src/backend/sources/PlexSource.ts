import { childLogger, Logger } from "@foxxmd/logging";
import concatStream from 'concat-stream';
import dayjs from "dayjs";
import EventEmitter from "events";
import formidable, { Files, File } from 'formidable';
import { file } from "jscodeshift";
import { PlayObject } from "../../core/Atomic.js";
import { combinePartsToString, truncateStringToLength } from "../../core/StringUtils.js";
import { FormatPlayObjectOptions, InternalConfig, SourceType } from "../common/infrastructure/Atomic.js";
import { PlexSourceConfig } from "../common/infrastructure/config/source/plex.js";
import { getFileIdentifier, getValidMultipartJsonFile } from "../utils/RequestUtils.js";
import AbstractSource from "./AbstractSource.js";

const shortDeviceId = truncateStringToLength(10, '');

export default class PlexSource extends AbstractSource {
    users: string[];
    libraries: string[];
    servers: string[];

    multiPlatform: boolean = true;

    declare config: PlexSourceConfig;

    constructor(name: any, config: PlexSourceConfig, internal: InternalConfig, type: SourceType = 'plex',emitter: EventEmitter) {
        super(type, name, config, internal, emitter);
        const {
            data: {
                user = [],
                libraries = [],
                servers = [],
            } = {},
            options: {
                logFilterFailure = 'warn'
            } = {}
        } = this.config

        if(logFilterFailure !== false && !['debug', 'warn'].includes(logFilterFailure)) {
            this.logger.warn(`logFilterFailure value of '${logFilterFailure.toString()}' is NOT VALID. Logging will not occur if filters fail. You should fix this.`);
        }

        if (!Array.isArray(user)) {
            if(user.trim() === '') {
                this.users = [];
            } else {
                this.users = user.split(',').map(x => x.trim());
            }
        } else {
            this.users = user;
        }
        this.users = this.users.map((x: any) => x.toLocaleLowerCase())

        if (!Array.isArray(libraries)) {
            this.libraries = [libraries];
        } else {
            this.libraries = libraries;
        }
        this.libraries = this.libraries.map((x: any) => x.toLocaleLowerCase())

        if (!Array.isArray(servers)) {
            this.servers = [servers];
        } else {
            this.servers = servers;
        }
        this.servers = this.servers.map((x: any) => x.toLocaleLowerCase())

        if (this.users.length === 0 && this.libraries.length === 0 && this.servers.length === 0) {
            this.logger.warn('Initializing, but with no filters! All tracks from all users on all servers and libraries will be scrobbled.');
        } else {
            this.logger.info(`Initializing with the following filters => Users: ${this.users.length === 0 ? 'N/A' : this.users.join(', ')} | Libraries: ${this.libraries.length === 0 ? 'N/A' : this.libraries.join(', ')} | Servers: ${this.servers.length === 0 ? 'N/A' : this.servers.join(', ')}`);
        }

        this.logger.warn('Plex WEBHOOK source is DEPRECATED and will be removed in an upcoming release! Please switch to Plex API Source as soon as possible.');
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions = {}): PlayObject {
        const {newFromSource = false} = options;
        const {
            event,
            Account: {
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                title: user,
            } = {},
            Metadata: {
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                type,
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                title: track,
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                parentTitle: album,
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                grandparentTitle: artist, // OR album artist
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                librarySectionTitle: library,
                // plex returns the track artist as originalTitle (when there is an album artist)
                // otherwise this is undefined
                originalTitle: trackArtist = undefined
            } = {},
            Server: {
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                title: server
            } = {},
            Player: {
                title,
                uuid,
            }
        } = obj;

        const artists: string[] = [];
        const albumArtists: string[] = [];
        if(trackArtist !== undefined) {
            artists.push(trackArtist);
            albumArtists.push(artist);
        } else {
            artists.push(artist);
        }
        return {
            data: {
                artists,
                albumArtists,
                album,
                track,
                playDate: dayjs(),
            },
            meta: {
                event,
                mediaType: type,
                user,
                library,
                server,
                source: 'Plex',
                newFromSource,
                deviceId: combinePartsToString([shortDeviceId(uuid), title])
            }
        }
    }

    protected logFilterFailure = (str: string, meta?: any) => {
        const {
            options: {
                logFilterFailure = 'warn'
            } = {}
        } = this.config;

        if(logFilterFailure === false || !['warn','debug'].includes(logFilterFailure)) {
            return false;
        }

        this.logger[logFilterFailure](str, meta);
    }

    isValidEvent = (playObj: PlayObject) => {
        const {
            meta: {
                mediaType, event, user, library, server
            },
            data: {
                artists,
                track,
            } = {}
        } = playObj;

        const hint = this.type === 'tautulli' ? ' (Check notification agent json data configuration)' : '';

        if (event !== undefined && event !== 'media.scrobble') {
            this.logger.debug(`Will not scrobble event because it is not media.scrobble (${event})`, {
                artists,
                track
            })
            return false;
        }

        if (mediaType !== 'track') {
            this.logger.debug(`Will not scrobble event because media type was not a track (${mediaType})`, {
                artists,
                track
            });
            return false;
        }

        if (this.users.length !== 0) {
            if (user === undefined) {
                this.logFilterFailure(`Config defined users but payload contained no user info${hint}`);
            } else if (!this.users.includes(user.toLocaleLowerCase())) {
                this.logFilterFailure(`Will not scrobble event because author was not an allowed user. Expected: ${this.users.map(x => `'${x}'`).join(' or ')} | Found: '${user.toLocaleLowerCase()}'`, {
                    artists,
                    track
                })
                return false;
            }
        }

        if (this.libraries.length !== 0) {
            if (library === undefined) {
                this.logFilterFailure(`Config defined libraries but payload contained no library info${hint}`);
            } else if (!this.libraries.includes(library.toLocaleLowerCase())) {
                this.logFilterFailure(`Will not scrobble event because library was not an allowed library. Expected: ${this.libraries.map(x => `'${x}'`).join(' or ')} | Found: '${library.toLocaleLowerCase()}'`, {
                    artists,
                    track
                })
                return false;
            }
        }

        if (this.servers.length !== 0) {
            if (server === undefined) {
                this.logFilterFailure(`Config defined server but payload contained no server info${hint}`);
            } else if (!this.servers.includes(server.toLocaleLowerCase())) {
                this.logFilterFailure(`Will not scrobble event because server was not an allowed server. Expected: ${this.servers.map(x => `'${x}'`).join(' or ')} | Found: '${server.toLocaleLowerCase()}'`, {
                    artists,
                    track
                })
                return false;
            }
        }

        return true;
    }

    handle = async (playObj: any) => {
        if (!this.isValidEvent(playObj)) {
            return;
        }

        try {
            const discovered = await this.discover([playObj]);
            await this.scrobble(discovered);
        } catch (e) {
            this.logger.error('Encountered error while scrobbling')
            this.logger.error(e)
        }
    }
}

export const plexRequestMiddle = (logger: Logger) => {

    const plexLog = childLogger(logger, 'Plex Request');

    return async (req: any, res: any, next: any) => {

        const form = formidable({
            allowEmptyFiles: true,
            multiples: true,
            fileWriteStreamHandler: (file: any) => concatStream((data: any) => {
                    file.buffer = data;
                })
        });
        form.on('progress', (received: any, expected: any) => {
            plexLog.debug(`Received ${received} bytes of expected ${expected}`);
        });
        form.on('error', (err: any) => {
            plexLog.error(err);
        })
        form.on('aborted', () => {
            plexLog.warn('Request aborted')
        })
        form.on('end', () => {
            plexLog.debug('Received end of form data from Plex');
        });
        form.on('fileBegin', (formname: any, file: any) => {
            plexLog.debug(`File Begin: ${formname}`);
        });
        form.on('file', (formname: any) => {
            plexLog.debug(`File Received: ${formname}`);
        });


        plexLog.debug('Receiving request from Plex...');

        return new Promise((resolve, reject) => {
            form.parse(req, (err: any, fields: any, files: Files | File) => {
                if (err) {
                    plexLog.error('Error occurred while parsing formdata');
                    plexLog.error(err);
                    next(err);
                    reject(err);
                    return;
                }

                let validFile,
                    fileResults;
                try {
                    const [vf, fr] = getValidMultipartJsonFile(files);
                    validFile = vf;
                    fileResults = fr;
                } catch (e) {
                    const parseError = new Error('Could not parse plex webhook formdata to valid files', {cause: e});
                    plexLog.error(parseError)
                    next(parseError);
                    reject(parseError);
                    return;
                }

                if (validFile === undefined) {
                    const validError = new Error(`No files parsed from formdata had a mimetype that included 'json' => ${fileResults.join('\n')}`);
                    plexLog.error(validError);
                    next(validError);
                    reject(validError);
                    return;
                } else {
                    plexLog.debug(`formdata file results => ${fileResults.join('\n')}`);
                }

                if(!('buffer' in validFile)) {
                    const buffErr = new Error(`${getFileIdentifier(validFile as unknown as File)} file should have had buffer but it did not!`);
                    plexLog.error(buffErr);
                    next(buffErr);
                    reject(buffErr);
                    return;
                }

                const payloadRaw = validFile.buffer.toString();
                let payload = null;
                try {
                    payload = JSON.parse(payloadRaw);
                    req.payload = payload;
                    next();
                    resolve(undefined);
                } catch (e) {
                    const jsonParseError = new Error(`Error occurred while trying to parse Plex formdata file ${getFileIdentifier(validFile as unknown as File)} to json. Raw text:\n${payloadRaw}`, {cause: e});
                    plexLog.error(jsonParseError);
                    next(jsonParseError);
                    reject(jsonParseError);
                    return;
                }
            });
        });
    };
}
