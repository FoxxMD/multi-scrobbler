import React, {Fragment} from 'react';
import {connect, ConnectedProps} from "react-redux";
import StatusCardSkeleton from "../components/statusCard/StatusCardSkeleton";
import SourceStatusCard from "../components/statusCard/SourceStatusCard";
import ClientStatusCard from "../components/statusCard/ClientStatusCard";
import {useGetStatusQuery} from "./statusApi";
import {clientAdapter, clientUpdate, sourceAdapter, sourceUpdate} from "./ducks";
import {RootState} from "../store";
import {useEventSource, useEventSourceListener} from "@react-nano/use-event-source";
const StatusSection = (props: PropsFromRedux) => {
    const {
        updateSource,
        updateClient
    } = props;
    const {data, error, isLoading} = useGetStatusQuery(undefined);

    const [sourceEventSource, eventSourceStatus] = useEventSource("api/events", false);
    useEventSourceListener(sourceEventSource, ['source', 'client'], evt => {
        const data = JSON.parse(evt.data);
        if(data.from === 'source') {
            updateSource(data);
        } else if(data.from === 'client') {
            updateClient(data);
        }
    }, [updateSource]);

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

const mapDispatchToProps = (dispatch) => {
    return {
        updateSource: (payload) => dispatch(sourceUpdate(payload)),
        updateClient: (payload) => dispatch(clientUpdate(payload))
    }
}

const connector = connect(mapStateToProps, mapDispatchToProps);

type PropsFromRedux = ConnectedProps<typeof connector>

export default connector(StatusSection);
