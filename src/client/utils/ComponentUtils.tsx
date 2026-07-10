import type { Card} from '@chakra-ui/react';
import type {HTMLChakraProps} from '@chakra-ui/react';
import type {PlayApiCommonDetailed} from '../../core/Api';
import { type LifecycleStep, QUEUE_STATUS_COMPLETED, QUEUE_STATUS_FAILED } from '../../core/Atomic';

export const cardHeaderSeparator: Card.HeaderProps = {
    borderBottomWidth: "1px",
    paddingBottom: "2"
};

export const timelineTextFormatting: HTMLChakraProps<"span"> = {
    //textAlign: "left",
    textWrap: "balance" 
}

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