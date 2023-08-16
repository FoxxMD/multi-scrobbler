import React, {Fragment} from 'react';
import StatusCardSkeleton, {StatusCardSkeletonData} from "./StatusCardSkeleton";
import SkeletonParagraph from "../skeleton/SkeletonParagraph";
import {SourceStatusData} from "../../../core/Atomic";
import {Link} from "react-router-dom";

export interface SourceStatusCardData extends StatusCardSkeletonData {
    loading?: boolean
    data?: SourceStatusData
}

const SourceStatusCard = (props: SourceStatusCardData) => {
    const {
        loading = false,
        data
    } = props;
    let header: string | undefined = undefined;
    let body = <SkeletonParagraph/>;
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
            type
        } = data;
        header = `(Source) ${display} - ${name}`

        // TODO links
        body = (<Fragment>
            <div><b>Status: {status}</b></div>
            <div>Tracks Discovered (since app started): {tracksDiscovered}</div>
            {canPoll && (!hasAuth || (hasAuth && authed)) ? <Link to={`/recent?type=${type}&name=${name}`}>See recently played tracks returned by API</Link> : null}
        </Fragment>);
    }
    return (
        <StatusCardSkeleton loading={loading} header={header}>
                {body}
        </StatusCardSkeleton>
    );
}

export default SourceStatusCard;
