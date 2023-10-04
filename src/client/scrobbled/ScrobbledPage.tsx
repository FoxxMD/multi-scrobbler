import React from 'react';
import PlayDisplay from "../components/PlayDisplay";
import {recentIncludes} from "../../core/Atomic";
import {useSearchParams} from "react-router-dom";
import {useGetRecentQuery} from "./scrobbledDucks";

const displayOpts = {
    include: recentIncludes,
    includeWeb: true
}

const scrobbled = () => {
    let [searchParams, setSearchParams] = useSearchParams();
    const {
        data = [],
        error,
        isLoading,
        isSuccess
    } = useGetRecentQuery({name: searchParams.get('name'), type: searchParams.get('type')});

    return (
        <div className="grid">
            <div className="shadow-md rounded bg-gray-500 text-white">
                <div className="p-3 font-semibold bg-gray-700 text-white">
                    <h2>Recently Scrobbled
                    </h2>
                </div>
                <div className="p-5">
                    {isSuccess && !isLoading && data.length === 0 ? 'No recently scrobbled tracks!' : null}
                    <ul>{data.map(x => <li key={x.index}><PlayDisplay data={x} buildOptions={displayOpts}/></li>)}</ul>
                </div>
            </div>
        </div>
    );
}

export default scrobbled;
