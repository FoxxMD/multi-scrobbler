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
    } = props;
    let header: string | undefined = undefined;
    let body = <SkeletonParagraph/>;
    if(data !== undefined) {
        const {
            hasAuth,
            name,
            type
        } = data;
        header = `(Client) ${data.display} - ${data.name}`

        // TODO links
        body = (<Fragment>
            <div><b>Status: {data.status}</b></div>
            <div>Tracks Scrobbled (since app started): {data.tracksDiscovered}</div>
            {hasAuth ? <a target="_blank" href={`/api/source/auth?name=${name}&type=${type}`}>(Re)authenticate or initialize</a> : null}
        </Fragment>);
    }
    return (
        <StatusCardSkeleton loading={loading} header={header}>
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
