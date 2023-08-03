import React, {Fragment} from 'react';
import {ClientStatusData} from "../../../../src/common/infrastructure/Atomic";
import StatusCardSkeleton, {StatusCardSkeletonData} from "./StatusCardSkeleton";
import SkeletonParagraph from "../skeleton/SkeletonParagraph";

export interface ClientStatusCardData extends StatusCardSkeletonData {
    loading?: boolean
    data?: ClientStatusData
}

const ClientStatusCard = (props: ClientStatusCardData) => {
    const {
        loading = false,
        data
    } = props;
    let header: string | undefined = undefined;
    let body = <SkeletonParagraph/>;
    if(data !== undefined) {
        header = `(Client) ${data.display} - ${data.name}`

        // TODO links
        body = (<Fragment>
            <div><b>Status: {data.status}</b></div>
            <div>Tracks Scrobbled (since app started): {data.tracksDiscovered}</div>
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

export default ClientStatusCard;
