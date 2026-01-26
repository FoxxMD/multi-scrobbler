import React, { Fragment, useMemo, useCallback, useState } from 'react';
import PlayDisplay from "../components/PlayDisplay";
import { recentIncludes } from "../../core/Atomic";
import { useSearchParams } from "react-router-dom";
import { useGetRecentQuery } from "./recentDucks";
import Tooltip from "../components/Tooltip";
import { faQuestionCircle, faClipboard, faFileClipboard, faBug } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCopyToClipboard } from '../components/copyToClipboardHook';
import clsx from "clsx";
import {patch} from 'jsondiffpatch';

const displayOpts = {
    include: recentIncludes,
    includeWeb: true
}

const apiTipContent = <Fragment>
    <div>Data that is directly returned by the Source API.</div>
    <div>If you do not see your recent plays in this data it is likely the Source's data is lagging behind your
        actual activity.
    </div>
    <div className="mt-2"></div>
</Fragment>;

const tsTip = <div className="mt-2">
    <div>
        <code>(C)</code> - Scrobble timestamped when listen was <strong>completed</strong>
    </div>
    <div>
        <code>(S)</code> - Scrobble timestamped when listen was <strong>started</strong>
    </div>
</div>;

const recent = () => {
    let [searchParams, setSearchParams] = useSearchParams();
    const {
        data = [],
        error,
        isLoading,
        isSuccess
    } = useGetRecentQuery({
        name: searchParams.get('name'),
        type: searchParams.get('type'),
        upstream: searchParams.get('upstream')
    });

    const { copy, isCopied } = useCopyToClipboard();

    const [copiedIndex, setIndex] = useState(null);

    const copyActionCB = useCallback((obj, index) => {
        copy(JSON.stringify(obj, null, 2));
        setIndex(index);
    },[copy, setIndex]);

    const baseClass = ['float-right'];

    const isUpstream = searchParams.get('upstream') === '1';

    const tipContents = useMemo(() => {
        return <Fragment>
            {isUpstream ? apiTipContent : null}
            {tsTip}
        </Fragment>
    }, [isUpstream]);

    return (
        <div className="grid">
            <div className="shadow-md rounded bg-gray-500 text-white">
                <div className="p-3 font-semibold bg-gray-700 text-white">
                    <h2>Recently Played{isUpstream ? ' from Source API' : null}<Tooltip message={tipContents}
                                                                                                      classNames={['ml-2']}
                                                                                                      style={{
                                                                                                          display: 'inline-flex',
                                                                                                          width: '35%'
                                                                                                      }}><FontAwesomeIcon
                        color="white" icon={faQuestionCircle}/></Tooltip>
                    </h2>
                </div>
                <div className="p-5">
                    {/*{isUpstream ? <span className="mb-3">Below is data directly returned by the Source API. MS uses</span> : null}*/}
                    {isSuccess && !isLoading && data.length === 0 ? 'No recently played tracks!' : null}
                    <ul>{data.map(x => {
                        const classes = [...baseClass].concat(copiedIndex !== x.index ? ['underline','cursor-pointer'] : []);
                        // let last = x.meta.lifecycle.original;
                        // x.meta.lifecycle.steps = x.meta.lifecycle.steps.map(y => {
                        //     if(y.patch !== undefined) {
                        //         // @ts-ignore
                        //         y.full = patch(last, y.patch);
                        //         // @ts-ignore
                        //         last = y.full;
                        //     }
                        //     return y;
                        // });
                        return <li key={x.index}><PlayDisplay data={x} buildOptions={displayOpts}/> <button className={clsx(classes)} onClick={() => copyActionCB(x.meta.lifecycle, x.index)}>{copiedIndex === x.index ? 'Copied!' : <FontAwesomeIcon
                        color="white" icon={faBug}/>}</button></li>
                })}</ul>
                </div>
            </div>
        </div>
    );
}

export default recent;
