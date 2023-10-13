import React, {useCallback, useEffect} from 'react';
import PlayDisplay from "../components/PlayDisplay";
import {recentIncludes} from "../../core/Atomic";
import {useSearchParams} from "react-router-dom";
import {
    useGetDeadQuery,
    useRemoveDeadSingleMutation,
    useProcessDeadSingleMutation, deadAdapter, clearDead
} from "./deadLetterDucks";
import dayjs from "dayjs";
import {RootState} from "../store";
import {connect, ConnectedProps} from "react-redux";

const displayOpts = {
    include: recentIncludes,
    includeWeb: true
}

const dead = (props: PropsFromRedux) => {
    const {
        data = [],
        clearDeadLetter
    } = props;

    useEffect(() => {
        return () => {
            console.log('clearing dead letter');
            clearDeadLetter();
        }
    }, []);

    let [searchParams, setSearchParams] = useSearchParams();
    const {
        isLoading,
        isSuccess
    } = useGetDeadQuery({name: searchParams.get('name'), type: searchParams.get('type')});

    const [removeDeadFetch] = useRemoveDeadSingleMutation();
    const [retryDeadFetch] = useProcessDeadSingleMutation();

    const retryDead = useCallback((id: string) => retryDeadFetch({name: searchParams.get('name'), type: searchParams.get('type'), id}), [retryDeadFetch, searchParams]);
    const removeDead = useCallback((id: string) => removeDeadFetch({name: searchParams.get('name'), type: searchParams.get('type'), id}), [removeDeadFetch, searchParams]);

    return (
        <div className="grid">
            <div className="shadow-md rounded bg-gray-500 text-white">
                <div className="p-3 font-semibold bg-gray-700 text-white">
                    <h2>Failed Scrobbles
                    </h2>
                </div>
                <div className="p-5">
                    {isSuccess && !isLoading && data.length === 0 ? 'No failed scrobbles!' : null}
                    <ul>{data.map(x => (<li className="my-2.5" key={x.id}>
                        <div className="text-lg"><PlayDisplay data={x.play} buildOptions={displayOpts}/></div>
                        <div><span className="font-semibold">Source</span>:{x.source.replace('Source -', '')}</div>
                        <div><span className="font-semibold">Last Retried</span>: {x.lastRetry === undefined ? 'Never' : dayjs.duration(dayjs().diff(dayjs(x.lastRetry))).humanize(true)}</div>
                        <div><span className="font-semibold">Retries</span>: {x.retries}</div>
                        <div onClick={() => retryDead(x.id)} className="capitalize underline cursor-pointer">Retry</div>
                        <div onClick={() => removeDead(x.id)} className="capitalize underline cursor-pointer">Remove</div>
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
