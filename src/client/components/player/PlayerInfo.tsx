import React, {Fragment} from 'react';
import './trackInfo.scss';
import {SourcePlayerJson} from "../../../core/Atomic";

export interface PlayerInfoProps {
    data: SourcePlayerJson
    isVisible: boolean
}

const PlayerInfo = (props: PlayerInfoProps) => {
    const {
        isVisible = true,
        data,
        data: {
            play,
        } = {}
    } = props;

    let isHidden = "";
    if (!isVisible) {
        isHidden = "hidden";
    }

    if (play === undefined || play === null) {
        return <ul className={["playlist", isHidden].join(' ')}>
        </ul>;
    }

    return (
        <div className={["playlist", isHidden, 'bg-gray-600'].join(' ')}>
            <div className="playlist_body">
                <div className="full">Player ID: <small>{data.platformId}</small></div>
                <div className="full">Player Updated: <small>{data.playerLastUpdatedAt}</small></div>
                <div className="full">Track Seen: <small>{data.playFirstSeenAt}</small></div>
                <div className="full">Track Updated: <small>{data.playLastUpdatedAt}</small></div>
            </div>
        </div>
    );
}
export default PlayerInfo;
