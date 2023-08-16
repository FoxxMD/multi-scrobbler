import React, {Fragment} from 'react';
import StatusCardSkeleton, {StatusCardSkeletonData} from "./StatusCardSkeleton";
import SkeletonParagraph from "../skeleton/SkeletonParagraph";
import {SourceStatusData} from "../../../core/Atomic";

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
    if(data !== undefined) {
        header = `(Source) ${data.display} - ${data.name}`

        // TODO links
        body = (<Fragment>
            <div><b>Status: {data.status}</b></div>
            <div>Tracks Discovered (since app started): {data.tracksDiscovered}</div>
        </Fragment>);
    }
    return (
        <StatusCardSkeleton loading={loading} header={header}>
            <div className="p-6 md:px-10 md:py-6">
                {body}
            </div>
        </StatusCardSkeleton>
    );
}

export default SourceStatusCard;
