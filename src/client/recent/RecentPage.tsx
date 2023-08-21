import React from 'react';
import PlayDisplay from "../components/PlayDisplay";
import {recentIncludes} from "../../core/Atomic";
import {useSearchParams} from "react-router-dom";
import {useGetRecentQuery} from "./recentDucks";

const displayOpts = {
    include: recentIncludes,
    includeWeb: true
}

const recent = () => {
    let [searchParams, setSearchParams] = useSearchParams();
    const { data = [], error, isLoading, isSuccess} = useGetRecentQuery({name: searchParams.get('name'), type: searchParams.get('type')});

    return (
        <div className="grid ">
            <div className="shadow-md rounded my-6 bg-gray-500 text-white">
                <div className="space-x-4 p-6 md:px-10 md:py-6 leading-6 font-semibold bg-gray-700 text-white">
                    <h2>Recently Played
                    </h2>
                </div>
                <div className="p-6 md:px-10 md:py-6">
                    {isSuccess && !isLoading && data.length === 0 ? 'No recently played tracks!' : null}
                    <ul>{data.map(x => <li key={x.index}><PlayDisplay data={x} buildOptions={displayOpts}/></li>)}</ul>
                </div>
            </div>
        </div>
    );
}

export default recent;
