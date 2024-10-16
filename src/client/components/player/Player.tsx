import React, {useState, useCallback, Fragment} from 'react';
import './player.scss';
import PlayerTimestamp from "./PlayerTimestamp";
import {SOURCE_SOT, SOURCE_SOT_TYPES, SourcePlayerJson} from "../../../core/Atomic";
import PlayerInfo from "./PlayerInfo";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faBars, faTimes, faQuestionCircle} from '@fortawesome/free-solid-svg-icons'

import {capitalize} from "../../../core/StringUtils";
import Tooltip from "../Tooltip";

export interface PlayerProps {
    data: SourcePlayerJson
    sot?: SOURCE_SOT_TYPES
}

export interface Track {
    name: string
    artist: string
    album: string
    year: number
    duration: number
    artwork: string
}

const Player = (props: PlayerProps) => {
    const {
        data,
        sot = SOURCE_SOT.PLAYER
    } = props;

    const {
        play: {
            data: {
                track = '???',
                artists = ['???'],
                duration = 0
            } = {},
        } = {},
        play,
        listenedDuration,
        status: {
            calculated = '???',
            reported,
            stale,
            orphaned
        }
    } = data;

    let durPer = null;
    if(duration !== undefined && duration !== null && duration !== 0) {
        if(listenedDuration === 0) {
            durPer = ' (0%)';
        } else {
            durPer = ` (${((listenedDuration/duration) * 100).toFixed(0)}%)`;
        }
    }

    const [viewMode, setViewMode] = useState('player');

    const toggleViewMode = useCallback(() => {
        let newViewMode = "";
        switch(viewMode) {
            case "player":
                newViewMode = "playlist";
                break;
            case "playlist":
                newViewMode = "player"
                break;
        }
        setViewMode(newViewMode);
    }, [viewMode, setViewMode]);

    return (
            <article className={["player", "mb-2"].join(' ')}>
                <div className="player__wrapper">
                    {sot === SOURCE_SOT.HISTORY ? <span className="player-tooltip"><Tooltip message="This player is for DISPLAY ONLY and likely represents a 'Now Playing' status exposed by the Source. For scrobbling Multi Scrobbler uses the 'recently played' or 'history' information provided by this source.">
                        <FontAwesomeIcon color="black" icon={faQuestionCircle}/>
                    </Tooltip></span> : null}
                    <button className="button toggle-playlist" onClick={toggleViewMode}>
                        <FontAwesomeIcon color="black" icon={viewMode === 'playlist' ? faTimes : faBars}/>
                    </button>
                <section className="player__body">
                    <p className="title">{calculated !== 'stopped' ? track : '-'}</p>
                    <p className="subtitle">{calculated !== 'stopped' ? artists.join(' / ') : '-'}</p>
                    <PlayerTimestamp duration={duration} current={data.position || 0} />
                    <div className="flex">
                        <p className="stats flex-1 text-left">Status: {capitalize(calculated)}</p>
                        <p className="stats flex-1 text-right">Listened: {calculated !== 'stopped' ? `${listenedDuration.toFixed(0)}s` : '-'}{durPer}</p>
                    </div>
                </section>
                    <PlayerInfo data={data} isVisible={viewMode === 'playlist'} />
                </div>
            </article>
    );
}

export default Player;
