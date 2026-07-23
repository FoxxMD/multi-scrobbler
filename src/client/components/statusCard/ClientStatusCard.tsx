import React, {Fragment, useCallback} from 'react';
import StatusCardSkeleton, {type StatusCardSkeletonData} from "./StatusCardSkeleton";
import SkeletonParagraph from "../skeleton/SkeletonParagraph";
import {clientAdapter} from "../../status/ducks";
import type {RootState} from "../../store";
import {connect, type ConnectedProps} from "react-redux";
import {Link} from "react-router-dom";
import {useStartClientMutation, useListenClientMutation} from "./clientDucks";

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
            deadLetterScrobbles = 0,
            deadLetterScrobblesTotal = 0,
        } = {}
    } = props;

    const [startClientPut, startResult] = useStartClientMutation();
        const [listenPut, listenResult] = useListenClientMutation();

    const tryStart = useCallback((name: string, force?: boolean) => startClientPut({name, force}), [startClientPut]);
    const tryListen = useCallback((name: string, type: string, currentListening?: boolean) => {
        // cycle through states
        let nextListen: boolean | undefined;
        switch(currentListening) {
            case true:
                nextListen = false;
                break;
            case false:
                nextListen = undefined;
                break;
            case undefined:
                nextListen = true;
                break;
        }
        listenPut({name, type, listening: nextListen});
    }, [listenPut]);

    let header: string | undefined = display;
    let body = <SkeletonParagraph/>;
    const startClientElement = (
        <Fragment>
    <div onClick={()  => tryStart(name)} className="capitalize underline cursor-pointer inline mr-1">{status === 'Running' ? 'Restart' : 'Start'}</div>
    (<div onClick={()  => tryStart(name, true)} className="capitalize underline cursor-pointer inline">Force</div>)
    </Fragment>)
    let subtitleElement = startClientElement;
    if(data !== undefined) {
        const {
            hasAuth,
            hasAuthInteraction,
            manualListening,
            systemListeningBehavior,
            name,
            type,
            authed,
            initialized
        } = data;
        header = `${display} (Client)`;

        const ml = useMemo(() => {
            if(listenResult.status !== 'fulfilled' || listenResult.data === undefined) {
                return manualListening;
            }
            return (listenResult.data as any).listening;
        }, [manualListening, listenResult]);

        const manualListenElement = (<Fragment>
                <span>Monitoring:</span>
                <div onClick={() => tryListen(name, type, ml)} 
                className="capitalize underline cursor-pointer inline mr-1 ml-1">
                    {ml !== undefined ? (ml ? 'Yes' : 'No') : null}
                    {ml === undefined ? <span>System {systemListeningBehavior ? '(Yes)' : '(No)'}</span> : null}
                </div>
                {/* {ml !== undefined ? <div onClick={() => tryListen(name, type, undefined)} 
                className="capitalize underline cursor-pointer inline">Clear
                </div> : null} */}
            </Fragment>);
        subtitleElement = <Fragment>{startClientElement}</Fragment>;//<Fragment>{manualListenElement} | {startClientElement}</Fragment>;

        const scrobbled = initialized && (!hasAuth || (hasAuth && authed)) ? <Link to={`/scrobbled?type=${type}&name=${name}`}>Tracks Scrobbled</Link> : <span>Tracks Scrobbled</span>;
        body = (<Fragment>
            <div>{scrobbled}: {scrobbledCount}</div>
            <div>Queued Scrobbles: {queued}</div>
            <div><Link to={`/dead?type=${type}&name=${name}`}>Failed Scrobbles</Link>: {deadLetterScrobbles} Queued / {deadLetterScrobblesTotal} Total</div>
            {hasAuthInteraction ? <a target="_blank" href={`/api/client/auth?name=${name}&type=${type}`}>(Re)authenticate</a> : null}
        </Fragment>);
    }
    return (
        <StatusCardSkeleton
            loading={loading}
            title={header}
            subtitle={name}
            status={status}
            subtitleRight={subtitleElement}
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
