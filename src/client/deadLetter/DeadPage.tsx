import React, {useCallback, useEffect, useState} from 'react';
import PlayDisplay from "../components/PlayDisplay";
import {recentIncludes} from "../../core/Atomic";
import {useSearchParams} from "react-router-dom";
import {
    useGetDeadQuery,
    useRemoveDeadSingleMutation,
    useProcessDeadSingleMutation,
    useLazyProcessDeadQuery,
    useLazyRemoveDeadQuery,
    deadAdapter,
    clearDead,
} from "./deadLetterDucks";
import dayjs from "dayjs";
import {RootState} from "../store";
import {connect, ConnectedProps} from "react-redux";
import {id} from "common-tags";

const displayOpts = {
    include: recentIncludes,
    includeWeb: true
}

const dead = (props: PropsFromRedux) => {
    const {
        data = [],
    } = props;

    let [searchParams, setSearchParams] = useSearchParams();
    const {
        isLoading,
        isSuccess
    } = useGetDeadQuery({name: searchParams.get('name'), type: searchParams.get('type')});

    const [removeDeadFetch, removeResult] = useRemoveDeadSingleMutation();
    const [retryDeadFetch, processResult] = useProcessDeadSingleMutation();
    const [removeAllDeadFetch] = useLazyRemoveDeadQuery();
    const [retryAllDeadFetch] = useLazyProcessDeadQuery();

    const retryDead = useCallback((id: string) => retryDeadFetch({name: searchParams.get('name'), type: searchParams.get('type'), id}), [retryDeadFetch, searchParams]);
    const removeDead = useCallback((id: string) => removeDeadFetch({name: searchParams.get('name'), type: searchParams.get('type'), id}), [removeDeadFetch, searchParams]);
    const removeAllDead = useCallback(() => removeAllDeadFetch({name: searchParams.get('name'), type: searchParams.get('type')}), [removeAllDeadFetch, searchParams]);
    const retryAllDead = useCallback(() => retryAllDeadFetch({name: searchParams.get('name'), type: searchParams.get('type')}), [retryAllDeadFetch, searchParams]);

    return (
        <div className="grid">
            <div className="shadow-md rounded bg-gray-500 text-white">
                <div className="p-3 font-semibold bg-gray-700 text-white">
                    <h2><span className="mr-1">Failed Scrobbles -</span> <span onClick={() => retryAllDead()} className="capitalize underline cursor-pointer max-w-fit">Retry All</span>
                        <span className="mx-2">|</span> <span onClick={() => removeAllDead()} className="capitalize underline cursor-pointer max-w-fit">Remove All</span>
                    </h2>
                </div>
                <div className="p-5">
                    {isSuccess && !isLoading && data.length === 0 ? 'No failed scrobbles!' : null}
                    <ul>{data.map(x => (<li className="my-2.5" key={x.id}>
                        <div className="text-lg"><PlayDisplay data={x.play} buildOptions={displayOpts}/></div>
                        <div><span className="font-semibold">Source</span>:{x.source.replace('Source -', '')}</div>
                        <div><span className="font-semibold">Retries</span>: {x.retries}</div>
                        <div><span className="font-semibold">Last Retried</span>: {x.lastRetry === undefined ? 'Never' : dayjs.duration(dayjs(x.lastRetry).diff(dayjs())).humanize(true)}</div>
                        <div><span className="font-semibold">Error</span>: <span className="font-mono text-sm">{x.error}</span></div>
                        <div onClick={() => retryDead(x.id)} className="capitalize underline cursor-pointer max-w-fit">Retry</div>
                        <div onClick={() => removeDead(x.id)} className="capitalize underline cursor-pointer max-w-fit">Remove</div>
                    </li>))}</ul>
                </div>
            </div>
        </div>
    );
}

const deadSelectors = deadAdapter.getSelectors();

const mapStateToProps = (state: RootState) => {
    return {
        data: deadSelectors.selectAll(state.deadLetter)
    }
}

const mapDispatchToProps = (dispatch) => {
    return {
        clearDeadLetter: () => dispatch(clearDead())
    }
}

const connector = connect(mapStateToProps, mapDispatchToProps);

type PropsFromRedux = ConnectedProps<typeof connector>

export default connector(dead);
