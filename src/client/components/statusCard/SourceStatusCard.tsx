import React, {Fragment, useCallback} from 'react';
import StatusCardSkeleton, {StatusCardSkeletonData} from "./StatusCardSkeleton";
import SkeletonParagraph from "../skeleton/SkeletonParagraph";
import {Link} from "react-router-dom";
import {sourceAdapter} from "../../status/ducks";
import {RootState} from "../../store";
import {connect, ConnectedProps} from "react-redux";

export interface SourceStatusCardData extends StatusCardSkeletonData, PropsFromRedux {
    loading?: boolean
}

const SourceStatusCard = (props: SourceStatusCardData) => {
    const {
        loading = false,
        data
    } = props;
    let header: string | undefined = undefined;
    let body = <SkeletonParagraph/>;
    const poll = useCallback(async () => {
        const params = new URLSearchParams({type: data.type, name: data.name});
        await fetch(`/api/poll?${params}`, {
            method: 'GET',
        });
    },[data]);
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
            type
        } = data;
        header = `(Source) ${display} - ${name}`

        // TODO links
        body = (<Fragment>
            <div><b>Status: {status}</b></div>
            <div>Tracks Discovered (since app started): {tracksDiscovered}</div>
            {canPoll && (!hasAuth || authed) ? <div><Link to={`/recent?type=${type}&name=${name}`}>See recently played tracks returned by API</Link></div> : null}
            {canPoll && hasAuthInteraction ? <a target="_blank" href={`/api/source/auth?name=${name}&type=${type}`}>(Re)authenticate and (re)start polling</a> : null}
            {canPoll && (!hasAuth || authed) ? <div onClick={poll} className="cursor-pointer underline">Restart Polling</div> : null}
        </Fragment>);
    }
    return (
        <StatusCardSkeleton loading={loading} header={header}>
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
