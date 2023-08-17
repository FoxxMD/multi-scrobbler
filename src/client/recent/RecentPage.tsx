import React, {Fragment, useState} from 'react';
import {
    useQuery,
} from '@tanstack/react-query'
import ky from "ky";
import PlayDisplay from "../components/PlayDisplay";
import {JsonPlayObject, recentIncludes} from "../../core/Atomic.js";
import {useSearchParams} from "react-router-dom";

const displayOpts = {
    include: recentIncludes,
    includeWeb: true
}

const recent = () => {
    let [searchParams, setSearchParams] = useSearchParams();
    const {isLoading, isSuccess, isError, data = [], error} = useQuery({
        queryKey: [`recent?${searchParams.toString()}`], queryFn: async () => {
            const res = await ky.get(`/api/recent?${searchParams.toString()}`).json() as JsonPlayObject[];
            return res.map((x, index) => ({...x, index: index + 1})) as (JsonPlayObject & { index: number })[];
        }
    });

    return (
        <div className="grid ">
            <div className="shadow-md rounded my-6 bg-gray-500 text-white">
                <div className="space-x-4 p-6 md:px-10 md:py-6 leading-6 font-semibold bg-gray-700 text-white">
                    <h2>Recently Played
                    </h2>
                </div>
                <div className="p-6 md:px-10 md:py-6">
                    <ul>{data.map(x => <li key={x.index}><PlayDisplay data={x} buildOptions={displayOpts}/></li>)}</ul>
                </div>
            </div>
        </div>
    );
}

export default recent;
