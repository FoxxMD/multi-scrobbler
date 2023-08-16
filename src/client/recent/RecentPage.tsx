import React, {Fragment, useState} from 'react';
import {
    useQuery,
} from '@tanstack/react-query'
import ky from "ky";
import PlayDisplay from "../components/PlayDisplay";
import {JsonPlayObject} from "../../core/Atomic.js";

const recent = () => {
    const {isLoading, isSuccess, isError, data, error} = useQuery({
        queryKey: ['recent?name=default&type=spotify'], queryFn: async () => {
            return await ky.get('/api/recent?name=default&type=spotify').json() as JsonPlayObject[]
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
                    <ul>{data.map(x => <li key={x.data.track}><PlayDisplay data={x}/></li>)}</ul>
                </div>
            </div>
        </div>
    );
}

export default recent;
