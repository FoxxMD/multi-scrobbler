import React, { ComponentProps } from 'react';
import JsonDiffReact from 'jsondiffpatch-react';
import { MSErrorBoundary } from './ErrorBoundary';
import { MarkOptional } from 'ts-essentials';
import { patchObject } from '../../core/DataUtils';
import './JsonDiff.css';
import { IJsonDelta } from 'json-diff-ts';

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
    diff?: IJsonDelta
}

export const JsonDiffPatch = (props: JsonDiffPatchProps) => {
    const {
        right,
        left,
        diff,
        ...rest
    } = props;
    const detachedLeft = JSON.parse(JSON.stringify(left));
    let realRight: DiffableVal;
    if (right !== undefined) {
        realRight = structuredClone(right);
    } else if (diff !== undefined) {
        realRight = patchObject(left, diff);
    } else {
        throw new Error(`must provide either 'right' or 'diff'`);
    }
    return <MSErrorBoundary>
        <JsonDiffReact {...rest} left={detachedLeft} right={realRight} />
    </MSErrorBoundary>
};