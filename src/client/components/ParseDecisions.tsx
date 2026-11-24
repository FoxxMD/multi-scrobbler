import { HStack, Icon, Stack, Tag, Text, Wrap } from '@chakra-ui/react';
import React from "react";
import { BsSkipForward } from "react-icons/bs";
import type { ParseDecision, ParseRecord } from "../../core/Atomic";
import { CheckIcon, XIcon } from "./icons/ChakraIcons";
import { Muted } from "./Typography";

const outcomeIcon = (outcome: ParseDecision['outcome']) => {
    switch (outcome) {
        case 'applied':
            return <CheckIcon color="green.focusRing"/>;
        case 'rejected':
            return <Icon color="orange.focusRing"><XIcon/></Icon>;
        default:
            return <Icon color="fg.muted"><BsSkipForward/></Icon>;
    }
}

const STEP_LABELS: Record<string, string> = {
    reference: 'Reference data',
    segment: 'Match whole artist names',
    joinedNames: 'Find artists with delimiters in their names',
    ignoreArtists: 'Ignored artists',
    delimiters: 'Split on delimiters',
    primaryArtistGate: 'Primary artist check',
    merge: 'Merge with reference artists',
    trackGate: 'Track name check',
    naive: 'Use submitted values',
};

/** User-friendly name for a parse step, falls back to the step name */
export const parseStepLabel = (step: string): string => STEP_LABELS[step] ?? step;

/** First rejected step, if any. A rejection means reference data (ex. MB mapping) was not trusted, fully or partially */
export const parseRecordRejection = (record: ParseRecord): ParseDecision | undefined => record.decisions.find(x => x.outcome === 'rejected');

/** True if final values came only from submitted values, without reference data */
export const parseRecordUsedNaive = (record: ParseRecord): boolean => record.decisions.some(x => x.step === 'naive');

export const ParseDecisions = (props: { record: ParseRecord }) => {
    const {record: {decisions}} = props;
    return (
        <Stack gap="2">
            {decisions.map((x, index) => (
                <Stack key={index} gap="1">
                    <HStack gap="2">
                        {outcomeIcon(x.outcome)}
                        {/* step name kept as tooltip so it can be matched to logs/code when troubleshooting */}
                        <Text fontWeight="medium" title={x.step}>{parseStepLabel(x.step)}</Text>
                        <Muted>{x.outcome}</Muted>
                    </HStack>
                    <Text ps="6">{x.reason}</Text>
                    {x.candidates !== undefined && x.candidates.length > 0 ? (
                        <Wrap ps="6" gap="1">
                            {x.candidates.map((c, cIndex) => <Tag.Root key={cIndex} size="sm"><Tag.Label>{c}</Tag.Label></Tag.Root>)}
                        </Wrap>
                    ) : null}
                </Stack>
            ))}
        </Stack>
    );
}
