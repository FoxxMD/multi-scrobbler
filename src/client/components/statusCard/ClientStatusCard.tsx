import React, {Fragment, useCallback} from 'react';
import StatusCardSkeleton, {StatusCardSkeletonData} from "./StatusCardSkeleton";
import SkeletonParagraph from "../skeleton/SkeletonParagraph";
import {clientAdapter} from "../../status/ducks";
import {RootState} from "../../store";
import {connect, ConnectedProps} from "react-redux";
import {Link} from "react-router-dom";
import {useStartClientMutation} from "./clientDucks";

export interface ClientStatusCardData extends StatusCardSkeletonData, PropsFromRedux {
    loading?: boolean
    key: any
}

const statusToStatusType = (status: string) => {
    const lower = status.toLowerCase();
    if(lower.includes('running') || lower.includes('data')) {
        return 'active';
    }
    if(lower.includes('idle')) {
        return 'warn';
    }
    return 'error';
}

const ClientStatusCard = (props: ClientStatusCardData) => {
    const {
        loading = false,
        data,
        data: {
            name,
            type,
            display,
            status,
            scrobbled: scrobbledCount = 0,
            queued = 0,
            deadLetterScrobbles = 0
        } = {}
    } = props;

    const [startClientPut, startResult] = useStartClientMutation();

    const tryStart = useCallback((name: string) => startClientPut({name}), [startClientPut]);

    let header: string | undefined = display;
    let body = <SkeletonParagraph/>;
    const startClientElement = <div onClick={()  => tryStart(name)} className="capitalize underline cursor-pointer">{status === 'Running' ? 'Restart' : 'Start'}</div>
    if(data !== undefined) {
        const {
            hasAuth,
            hasAuthInteraction,
            name,
            type,
            authed,
            initialized
        } = data;
        if(type === 'lastfm' || type === 'listenbrainz')
        header = `${display} (Client)`;

        const scrobbled = initialized && (!hasAuth || (hasAuth && authed)) ? <Link to={`/scrobbled?type=${type}&name=${name}`}>Tracks Scrobbled</Link> : <span>Tracks Scrobbled</span>;

        // TODO links
        body = (<Fragment>
            <div>{scrobbled}: {scrobbledCount}</div>
            <div>Queued Scrobbles: {queued}</div>
            <div><Link to={`/dead?type=${type}&name=${name}`}>Failed Scrobbles</Link>: {deadLetterScrobbles}</div>
            {hasAuthInteraction ? <a target="_blank" href={`/api/client/auth?name=${name}&type=${type}`}>(Re)authenticate</a> : null}
        </Fragment>);
    }
    return (
        <StatusCardSkeleton
            loading={loading}
            title={header}
            subtitle={name}
            status={status}
            subtitleRight={startClientElement}
            statusType={statusToStatusType(status)}>
                {body}
        </StatusCardSkeleton>
    );
}

const simpleSelectors = clientAdapter.getSelectors();

const mapStateToProps = (state: RootState, props) => ({
    data: simpleSelectors.selectById(state.clients, props.id)
});

const connector = connect(mapStateToProps);

type PropsFromRedux = ConnectedProps<typeof connector>

export default connector(ClientStatusCard);
