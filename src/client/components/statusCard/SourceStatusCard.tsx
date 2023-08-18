import React, {Fragment, useCallback} from 'react';
import StatusCardSkeleton, {StatusCardSkeletonData} from "./StatusCardSkeleton";
import SkeletonParagraph from "../skeleton/SkeletonParagraph";
import {ClientStatusData, SourceStatusData} from "../../../core/Atomic";
import {Link} from "react-router-dom";
import {QueryClient} from "@tanstack/react-query";
import ky from "ky";

export interface SourceStatusCardData extends StatusCardSkeletonData {
    loading?: boolean
    data?: SourceStatusData
}

const queryClient = new QueryClient();

const SourceStatusCard = (props: SourceStatusCardData) => {
    const {
        loading = false,
        data
    } = props;
    let header: string | undefined = undefined;
    let body = <SkeletonParagraph/>;
    const poll = useCallback(async () => {
        await queryClient.fetchQuery(['poll', data.type, data.name], async () => {
                return await ky.get('/api/poll', {searchParams: {type: data.type, name: data.name}});
        })
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

export default SourceStatusCard;
