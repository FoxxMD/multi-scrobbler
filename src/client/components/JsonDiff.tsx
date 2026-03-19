import React, { ComponentProps } from 'react';
import JsonDiffReact from 'jsondiffpatch-react';
import { MSErrorBoundary } from './ErrorBoundary';
import { Delta } from 'jsondiffpatch';
import { MarkOptional } from 'ts-essentials';
import { jdiff } from '../../core/DataUtils';
import './JsonDiff.css';

type DiffableVal = [] | object | string;

export interface JsonDiffReactProps {
    right: DiffableVal,
    left: DiffableVal
    show?: boolean,
    annotated?: boolean,
    tips?: any,
    objectHash?: CallableFunction,
}

export type JsonDiffPatchProps = MarkOptional<JsonDiffReactProps, 'right'> & {
    diff?: Delta | object
}

export const JsonDiffPatch = (props: JsonDiffPatchProps) => {
    const {
        right,
        diff,
        ...rest
    } = props;
    let realRight: DiffableVal;
    if (right !== undefined) {
        realRight = right;
    } else if (diff !== undefined) {
        realRight = jdiff.patch(props.left, diff as Delta) as DiffableVal;
    } else {
        throw new Error(`must provide either 'right' or 'diff'`);
    }
    return <MSErrorBoundary>
        <JsonDiffReact {...rest} right={realRight} />
    </MSErrorBoundary>
};