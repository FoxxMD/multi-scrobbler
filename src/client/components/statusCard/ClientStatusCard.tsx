import React, {Fragment} from 'react';
import StatusCardSkeleton, {StatusCardSkeletonData} from "./StatusCardSkeleton";
import SkeletonParagraph from "../skeleton/SkeletonParagraph";
import {clientAdapter} from "../../status/ducks";
import {RootState} from "../../store";
import {connect, ConnectedProps} from "react-redux";

export interface ClientStatusCardData extends StatusCardSkeletonData, PropsFromRedux {
    loading?: boolean
    key: any
}

const ClientStatusCard = (props: ClientStatusCardData) => {
    const {
        loading = false,
        data,
        data: {
            name,
            type,
            display,
            status
        } = {}
    } = props;
    let header: string | undefined = display;
    let body = <SkeletonParagraph/>;
    if(data !== undefined) {
        const {
            hasAuth,
            name,
            type
        } = data;
        if(type === 'lastfm' || type === 'listenbrainz')
        header = `${display} (Client)`;

        // TODO links
        body = (<Fragment>
            <div>Tracks Scrobbled (since app started): {data.tracksDiscovered}</div>
            {hasAuth ? <a target="_blank" href={`/api/source/auth?name=${name}&type=${type}`}>(Re)authenticate or initialize</a> : null}
        </Fragment>);
    }
    return (
        <StatusCardSkeleton loading={loading} title={header} subtitle={name} status={status}>
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
