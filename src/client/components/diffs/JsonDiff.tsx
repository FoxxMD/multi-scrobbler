import {
  parseDiffFromFile,
  type FileContents
} from '@pierre/diffs';
import {
  type FileDiffMetadata,
  type FileDiffProps,
  FileDiff,
} from '@pierre/diffs/react';
import type { MarkRequired } from 'ts-essentials';
import type { Changeset } from 'json-diff-ts';
import { MSErrorBoundary } from '../ErrorBoundary';
import { patchObject } from "../../../core/DataUtils";

type DiffableVal = [] | object | string;

interface JsonDiffOptionalProps {
    right?: DiffableVal,
    left: DiffableVal
    diff?: Changeset
    diffOpts?: FileDiffProps<undefined>
}

export type JsonDiffProps = MarkRequired<JsonDiffOptionalProps, 'diff'> | MarkRequired<JsonDiffOptionalProps, 'right'>

const JsonDiffPatchComponent = (props: JsonDiffProps) => {
    const {
        right: rightVal,
        left,
        diff,
        diffOpts = {},
    } = props;

    if(rightVal === undefined && diff === undefined) {
        throw new Error(`Must provide either 'right' or 'diff' props`);        
    }

    let right = rightVal;
    if(right === undefined) {
        right = patchObject(structuredClone(left), diff);
    }

    const fileDiff: FileDiffMetadata = parseDiffFromFile(valToFileContents(left), valToFileContents(right));
    return <FileDiff
      // Required: pre-parsed FileDiffMetadata
      fileDiff={fileDiff}
      options={{
        theme: { dark: 'github-dark', light: 'github-light' },
        diffStyle: 'unified',
        themeType: 'system',
        lineDiffType: 'word-alt',
        disableFileHeader: true,
        disableLineNumbers: true,
        ...diffOpts
      }}
    />
}

export const JsonDiffPatch = (props: JsonDiffProps) => <MSErrorBoundary><JsonDiffPatchComponent {...props}/></MSErrorBoundary>

const valToFileContents = (val: DiffableVal, fileContentOpts: Partial<FileContents> = {}): FileContents => {
    let strContent: string;
    const {
        name = 'Content'
    } = fileContentOpts;
    let fileName: string = name;
    let lang: FileContents['lang'];
    if(typeof val === 'string') {
        strContent = val;
    } else {
        strContent = JSON.stringify(val, undefined, 2);
        lang = 'json';
    }
    return {
        name: fileName,
        lang,
        contents: strContent
    };
}