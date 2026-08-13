import type { Card, IconProps, HTMLChakraProps} from '@chakra-ui/react';
import { Span } from '@chakra-ui/react';
import type {PlayApiCommonDetailed} from '../../core/Api';
import { type LifecycleStep, QUEUE_STATUS_COMPLETED, QUEUE_STATUS_FAILED } from '../../core/Atomic';
import { isErrorIsh, type ErrorIsh } from '../../core/ErrorUtils';

export const cardHeaderSeparator: Card.HeaderProps = {
    borderBottomWidth: "1px",
    paddingBottom: "2"
};

export const timelineTextFormatting: HTMLChakraProps<"span"> = {
    //textAlign: "left",
    textWrap: "balance" 
}

export const timelineIconProps: IconProps = {
    fontSize: 'md'
}

export const TimelineItemSummaryText = (props: HTMLChakraProps<"span"> & {children: React.ReactNode}) => <Span {...timelineTextFormatting}>{props.children}</Span>

export const activityTransformHasIssue = (steps: LifecycleStep[]): 'warn' | 'error' | undefined => {
    for(const step of steps) {
        if(step.flowKnownState === 'prereq') {
            return 'warn';
        }
        if(step.flowKnownState === 'skip') {
            continue;
        }
        if(step.error !== undefined && step.error !== null && Object.keys(step.error).length > 0) {
            return 'error';
        }
    }
    return undefined;
}

export const activityTimelineHasIssue = (activity: PlayApiCommonDetailed): 'warn' | 'error' | undefined => {
    const {
        queueStates = [],
        play: {
            lifecycle = [],
            scrobble: {
                error: scrobbleError,
                warnings: scrobbleWarnings = []
            } = {},
        } = {},
    } = activity;
    const transformIssue = activityTransformHasIssue(lifecycle);
    if(transformIssue !== undefined) {
        return transformIssue;
    }
    if (scrobbleError !== undefined) {
        return 'error';
    }
    if(scrobbleWarnings.length > 0) {
        return 'warn';
    }
    if (queueStates.some(x => x.queueStatus === QUEUE_STATUS_FAILED) && !queueStates.some(x => x.queueStatus === QUEUE_STATUS_COMPLETED)) {
        return 'error';
    }

    return undefined;
}

export interface ErrorData {
    name?: string
    code?: string
    message?: string
    stack?: string
}

export const walkError = (err: ErrorIsh, errors: ErrorData[] = []): ErrorData[] => {
    const thisErr: ErrorData = {
        name: err.name,
        code: 'code' in err ? err.code : undefined,
        message: err.message,
        stack: err.stack
    };
    errors.push(thisErr);
    if(isErrorIsh(err.cause)) {
        return walkError(err.cause, errors);
    }
    return errors;
}

export const findAuthError = (err: ErrorIsh): ErrorIsh | undefined => {
    if(err.name === 'Authentication Check') {
        return err;
    }
    if(err.cause === undefined || !isErrorIsh(err.cause)) {
        return undefined;
    }
    return findAuthError(err.cause);
}