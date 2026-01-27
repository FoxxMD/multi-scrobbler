import React, {useCallback, useState} from 'react';
import PlayDisplay from "../components/PlayDisplay";
import {recentIncludes} from "../../core/Atomic";
import {useSearchParams} from "react-router-dom";
import {useGetRecentQuery} from "./scrobbledDucks";
import { useCopyToClipboard } from '../components/copyToClipboardHook';
import { faBug } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import clsx from "clsx";

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

    const { copy, isCopied } = useCopyToClipboard();

    const [copiedIndex, setIndex] = useState(null);

    const copyActionCB = useCallback((obj, index) => {
        copy(JSON.stringify(obj, null, 2));
        setIndex(index);
    },[copy, setIndex]);

    const baseClass = ['mr-3'];


    return (
        <div className="grid">
            <div className="shadow-md rounded bg-gray-500 text-white">
                <div className="p-3 font-semibold bg-gray-700 text-white">
                    <h2>Recently Scrobbled
                    </h2>
                </div>
                <div className="p-5">
                    {isSuccess && !isLoading && data.length === 0 ? 'No recently scrobbled tracks!' : null}
                    <ul>{data.map(x => {
                        const classes = [...baseClass].concat(copiedIndex !== x.index ? ['underline','cursor-pointer'] : []);
                        
                        return <li key={x.index}>
                            <button className={clsx(classes)} onClick={() => copyActionCB(x.meta.lifecycle, x.index)}>{copiedIndex === x.index ? 'Copied!' : <FontAwesomeIcon
                                                color="white" icon={faBug}/>}</button>
                                                <PlayDisplay data={x} buildOptions={displayOpts}/>
                                </li>;
                })} </ul>
                </div>
            </div>
        </div>
    );
}

export default scrobbled;
