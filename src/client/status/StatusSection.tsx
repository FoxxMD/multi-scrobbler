import React, {Fragment} from 'react';
import {connect, ConnectedProps} from "react-redux";
import StatusCardSkeleton from "../components/statusCard/StatusCardSkeleton";
import SourceStatusCard from "../components/statusCard/SourceStatusCard";
import ClientStatusCard from "../components/statusCard/ClientStatusCard";
import {useGetStatusQuery} from "./statusApi";
import {clientAdapter, sourceAdapter} from "./ducks";
import {RootState} from "../store";
const StatusSection = (props: PropsFromRedux) => {
    const {data, error, isLoading} = useGetStatusQuery(undefined);

    return (
        <Fragment>
            <div className="grid md:grid-cols-3 gap-3">
                {isLoading ? <StatusCardSkeleton loading={isLoading}/> : undefined}
                {props.sourceIds.map(x => <SourceStatusCard id={x} key={x}/>)}
            </div>
            <div className="grid md:grid-cols-3 gap-3">
                {!isLoading ? props.clientIds.map(x => <ClientStatusCard id={x} key={x}/>) : null}
            </div>
        </Fragment>
    );
}

const simpleSourceSelectors = sourceAdapter.getSelectors();
const simpleClientSelectors = clientAdapter.getSelectors();
const mapStateToProps = (state: RootState) => {
    return {
        sourceIds: simpleSourceSelectors.selectIds(state.sources),
        clientIds: simpleClientSelectors.selectIds(state.clients),
    }
}

const connector = connect(mapStateToProps);

type PropsFromRedux = ConnectedProps<typeof connector>

export default connector(StatusSection);
