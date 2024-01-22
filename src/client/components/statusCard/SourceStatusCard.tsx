import React, {Fragment, useCallback} from 'react';
//import {AuthorizationCodeWithPKCEStrategy, SpotifyApi} from "@spotify/web-api-ts-sdk";
import StatusCardSkeleton, {StatusCardSkeletonData} from "./StatusCardSkeleton";
import SkeletonParagraph from "../skeleton/SkeletonParagraph";
import {Link} from "react-router-dom";
import {sourceAdapter} from "../../status/ducks";
import {RootState} from "../../store";
import {connect, ConnectedProps} from "react-redux";
import Player from "../player/Player";
import './statusCard.scss';
import {SpotifyAuthLink} from "./SpotifyAuthLink";

export interface SourceStatusCardData extends StatusCardSkeletonData, PropsFromRedux {
    loading?: boolean
    onAuthClick?: Function
}

/*const sdk = new SpotifyApi(new AuthorizationCodeWithPKCEStrategy("a89cfb5169404e0791d5a6475ffd4eb2", "http://localhost:9078", [
    'user-read-recently-played',
    'user-read-currently-playing',
    'user-read-playback-state',
    'user-read-playback-position'
]));*/

const statusToStatusType = (status: string) => {
    const lower = status.toLowerCase();
    if(lower.includes('running') || lower.includes('polling') || lower.includes('awaiting data')) {
        return 'active';
    }
    if(lower.includes('idle')) {
        return 'warn';
    }
    return 'error';
}

const SourceStatusCard = (props: SourceStatusCardData) => {
    const {
        loading = false,
        onAuthClick = undefined,
        data,
        data: {
            display,
            name,
            status,
        } = {}
    } = props;
    let header: string | undefined = display;
    let body = <SkeletonParagraph/>;
    const poll = useCallback(async () => {
        const params = new URLSearchParams({type: data.type, name: data.name});
        await fetch(`/api/poll?${params}`, {
            method: 'GET',
        });
    },[data]);
    let startSourceElement = null;
    if(data !== undefined)
    {
        const {
            display,
            name,
            canPoll,
            hasAuth,
            authed,
            status,
            tracksDiscovered,
            hasAuthInteraction,
            type,
            players = {}
        } = data;
        if(type === 'listenbrainz' || type === 'lastfm') {
            header = `${display} (Source)`;
        }

        const platformIds = Object.keys(players);

        const discovered = (!hasAuth || authed) ? <Link to={`/recent?type=${type}&name=${name}`}>Tracks Discovered</Link> : <span>Tracks Discovered</span>;

        if((!hasAuth || authed) && canPoll) {
            startSourceElement = <div onClick={poll} className="capitalize underline cursor-pointer">{status === 'Polling' ? 'Restart' : 'Start'}</div>
        }

        let authAction = null;
        if(canPoll && hasAuthInteraction) {
            if(type === 'spotify') {

                authAction = <SpotifyAuthLink name={name} clientId="a89cfb5169404e0791d5a6475ffd4eb2" redirectUri={'http://localhost:9078/callback'} />
            } else {
                authAction = <a target="_blank" href={`/api/source/auth?name=${name}&type=${type}`}>(Re)authenticate</a>;
            }
        }

        // TODO links
        body = (<div className="statusCardBody">
        {platformIds.map(x => <Player key={x} data={players[x]}/>)}
            <div>{discovered}: {tracksDiscovered}</div>
            {authAction}
            {/*{canPoll && hasAuthInteraction ? <a target="_blank" href={`/api/source/auth?name=${name}&type=${type}`}>(Re)authenticate</a> : null}*/}
        </div>);
    }
    return (
        <StatusCardSkeleton
            loading={loading}
            title={header}
            subtitle={name}
            status={status}
            subtitleRight={startSourceElement}
            statusType={statusToStatusType(status)}>
                {body}
        </StatusCardSkeleton>
    );
}

const simpleSelectors = sourceAdapter.getSelectors();

const mapStateToProps = (state: RootState, props) => ({
    data: simpleSelectors.selectById(state.sources, props.id)
});

const connector = connect(mapStateToProps);

type PropsFromRedux = ConnectedProps<typeof connector>

export default connector(SourceStatusCard);
