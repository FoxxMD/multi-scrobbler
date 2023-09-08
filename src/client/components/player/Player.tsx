import React, {useState, useCallback, Fragment} from 'react';
import './player.scss';
import PlayerTimestamp from "./PlayerTimestamp";
import {SourcePlayerJson} from "../../../core/Atomic";
import PlayerInfo from "./PlayerInfo";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faBars, faTimes} from '@fortawesome/free-solid-svg-icons'

export interface PlayerProps {
    data: SourcePlayerJson
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
    } = props;

    const {
        play: {
            data: {
                track = '???',
                artists = ['???'],
                duration = 0
            } = {}
        } = {},
        play
    } = data;

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
        <div>
            <article className={["player", "mb-2"].join(' ')}>
                <div className="player__wrapper">
                    <button className="button toggle-playlist" onClick={toggleViewMode}>
                        <FontAwesomeIcon color="black" icon={viewMode === 'playlist' ? faTimes : faBars}/>
                    </button>
                <section className="player__body">
                    <p className="title">{track}</p>
                    <p className="subtitle">{artists.join(' / ')}</p>
                    <PlayerTimestamp duration={duration} current={data.position || 0} />
                </section>
                    <PlayerInfo data={data} isVisible={viewMode === 'playlist'} />
                </div>
            </article>
        </div>
    );
}

export default Player;
