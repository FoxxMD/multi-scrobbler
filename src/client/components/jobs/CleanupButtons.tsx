import { Button, HStack, Stack, Text } from '@chakra-ui/react';
import { useState, type ReactNode } from 'react';
import type { CleanupAction } from "../../../core/Job";

/**
 * Compact and Delete buttons that ask for confirmation, showing what the chosen action does.
 * */
export const CleanupButtons = (props: {
    /** what each action does, shown when confirming */
    explain: Record<CleanupAction, ReactNode>
    onConfirm: (action: CleanupAction) => void
    pending?: boolean
    /** shown instead of the buttons */
    disabledReason?: ReactNode
    size?: 'xs' | 'sm'
}) => {
    const {explain, onConfirm, pending = false, disabledReason, size = 'xs'} = props;
    const [confirming, setConfirming] = useState<CleanupAction | undefined>();
    if (disabledReason !== undefined) {
        return <Text textStyle="sm" color="fg.muted">{disabledReason}</Text>;
    }
    if (confirming === undefined) {
        return (
            <HStack>
                <Button size={size} variant="subtle" disabled={pending} onClick={() => setConfirming('compact')}>Compact</Button>
                <Button size={size} variant="subtle" colorPalette="red" disabled={pending} onClick={() => setConfirming('delete')}>Delete</Button>
            </HStack>
        );
    }
    return (
        <Stack gap="2">
            <Text textStyle="sm">{explain[confirming]}</Text>
            <HStack>
                <Button size={size} variant="subtle" disabled={pending} onClick={() => setConfirming(undefined)}>Cancel</Button>
                <Button size={size} colorPalette={confirming === 'delete' ? 'red' : undefined} loading={pending} onClick={() => {
                    onConfirm(confirming);
                    setConfirming(undefined);
                }}>{confirming === 'delete' ? 'Delete' : 'Compact'}</Button>
            </HStack>
        </Stack>
    );
}
