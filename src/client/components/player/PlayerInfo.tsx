import React, {Fragment} from 'react';
import './trackInfo.scss';
import {SourcePlayerJson} from "../../../core/Atomic";
import {isoToHuman} from "../../utils/index";

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
            status: {
                calculated,
                reported
            }
        } = {},
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
                <div className="full">Player Updated: <small>{isoToHuman(data.playerLastUpdatedAt, {includeRelative: true})}</small></div>
                <div className="full">Track Seen: <small>{isoToHuman(data.playFirstSeenAt, {includeRelative: true})}</small></div>
                <div className="full">Track Updated: <small>{isoToHuman(data.playLastUpdatedAt, {includeRelative: true})}</small></div>
                <div className="full">Status: <small>Calculated -&gt; {calculated.toUpperCase()} | Reported -&gt; {reported.toUpperCase()} </small></div>
            </div>
        </div>
    );
}
export default PlayerInfo;
