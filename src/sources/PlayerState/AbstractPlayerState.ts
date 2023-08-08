import {
    ListenRange, PlayData,
    PlayObject,
    PlayPlatformId,
    REPORTED_PLAYER_STATUSES,
    ReportedPlayerStatus
} from "../../common/infrastructure/Atomic.js";
import dayjs, {Dayjs} from "dayjs";
import {playObjDataMatch} from "../../utils.js";

export abstract class AbstractPlayerState {
    reportedStatus: ReportedPlayerStatus = REPORTED_PLAYER_STATUSES.unknown
    platformId: PlayPlatformId
    currentPlay?: PlayObject
    playFirstSeenAt?: Dayjs
    currentListenRange?: ListenRange
    listenRanges: ListenRange[] = [];

    protected constructor(platformId: PlayPlatformId, initialPlay?: PlayObject, status?: ReportedPlayerStatus) {
        this.platformId = platformId;
        if(initialPlay !== undefined) {
            this.setPlay(initialPlay, status);
        }
    }

    platformEquals(candidateId: PlayPlatformId) {
        return this.platformId[0] === candidateId[0] && this.platformId[1] === candidateId[0];
    }

    // TODO track player position from PlayObject against listen session

    setPlay(play: PlayObject, status: ReportedPlayerStatus = 'playing'): [PlayObject, PlayObject?] {
        if (this.currentPlay !== undefined) {
            if (!playObjDataMatch(this.currentPlay, play)/* || (true !== false)*/) { // TODO check new play date and listen range to see if they intersect
                this.currentListenSessionEnd();
                const played = this.getPlayedObject();
                this.setCurrentPlay(play);
                return [this.getPlayedObject(), played];
            } else if (status === 'playing') {
                this.currentListenSessionContinue();
            } else {
                this.currentListenSessionEnd();
            }
        } else {
            this.setCurrentPlay(play);
            return [this.getPlayedObject(), undefined];
        }
    }

    getPlayedObject(): PlayObject {
        return {
            data: {
                ...this.currentPlay.data,
                playDate: this.playFirstSeenAt,
                listenedFor: this.getListenDuration(),
                listenRanges: this.listenRanges
            },
            meta: this.currentPlay.meta
        }
    }

    getListenDuration() {
        let listenDur: number = 0;
        for (const [start, end] of this.listenRanges) {
            const dur = start.diff(end, 'seconds');
            listenDur += dur;
        }
        return listenDur;
    }

    currentListenSessionContinue() {
        const now = dayjs();
        if (this.currentListenRange === undefined) {
            this.currentListenRange = [now, now];
        } else {
            this.currentListenRange = [this.currentListenRange[0], now];
        }
    }

    currentListenSessionEnd() {
        if (this.currentListenRange !== undefined && this.currentListenRange[0].unix() !== this.currentListenRange[1].unix()) {
            this.listenRanges.push(this.currentListenRange);
        }
        this.currentListenRange = undefined;
    }

    setCurrentPlay(play: PlayObject, status: ReportedPlayerStatus = 'playing') {
        this.currentPlay = play;
        this.playFirstSeenAt = dayjs();
        this.reportedStatus = status;
        this.listenRanges = [];
        this.currentListenRange = undefined;
        if (status === 'playing') {
            this.currentListenSessionContinue();
        }
    }
}
