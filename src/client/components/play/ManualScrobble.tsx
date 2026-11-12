import { useMemo, useState } from "react";
import { Button, Checkbox, CloseButton, Dialog, Portal, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import ky, { HTTPError } from "ky";
import type { PlayObjectMinimal } from "../../../core/Atomic";
import { tanQueries } from "../../queries";
import { toaster } from "../Toaster";
import { PlayEdit } from "./PlayEdit";

export interface ManualScrobbleDialogProps {
    open: boolean
    setOpen: (open: boolean) => void
}

export const ManualScrobbleDialog = (props: ManualScrobbleDialogProps) => {
    const { data: components = [] } = useQuery({ ...tanQueries.components.list() });
    const clients = useMemo(() => components.filter(x => x.mode === 'client'), [components]);
    // uids the user unchecked, so every client (including ones that load later) is checked by default
    const [unchecked, setUnchecked] = useState<string[]>([]);
    const selected = clients.filter(x => !unchecked.includes(x.uid));
    // PlayEdit fills track/artists defaults, only playDate needs a starting value
    const initialPlay = useMemo(() => ({ data: { playDate: new Date().toISOString() }, meta: {} }) as PlayObjectMinimal<string>, []);

    const { mutate, isPending } = useMutation({
        mutationKey: ['manualScrobble'],
        mutationFn: (vals: { play: PlayObjectMinimal<string>['data'], clients?: string[] }) =>
            ky.post('api/scrobble', { json: vals }).json<{ queued: string[] }>(),
        onSuccess: (res) => {
            const names = clients.filter(x => res.queued.includes(x.uid)).map(x => x.name);
            toaster.create({ type: 'success', title: 'Scrobbled', description: `Sent to ${names.join(', ')}` });
            props.setOpen(false);
        },
        onError: async (e) => {
            let description = e.message;
            if (e instanceof HTTPError && e.response.status === 400) {
                const body = await e.response.clone().json().catch(() => undefined) as { error?: string } | undefined;
                description = body?.error ?? description;
            }
            toaster.create({ type: 'error', title: 'Scrobble failed', description });
        }
    });

    return (<Dialog.Root
        closeOnInteractOutside
        unmountOnExit
        open={props.open}
        size="lg"
        onOpenChange={(e) => props.setOpen(e.open)}
    >
        <Portal>
            <Dialog.Backdrop />
            <Dialog.Positioner>
                <Dialog.Content>
                    <Dialog.CloseTrigger asChild>
                        <CloseButton />
                    </Dialog.CloseTrigger>
                    <Dialog.Header>
                        <Dialog.Title>Scrobble manually</Dialog.Title>
                    </Dialog.Header>
                    <Dialog.Body>
                        <Stack gap="4">
                            <Stack gap="2">
                                <Text fontWeight="bold">Clients</Text>
                                {clients.map(c => (
                                    <Checkbox.Root
                                        key={c.uid}
                                        checked={!unchecked.includes(c.uid)}
                                        onCheckedChange={(d) => setUnchecked(prev => d.checked ? prev.filter(u => u !== c.uid) : [...prev, c.uid])}
                                    >
                                        <Checkbox.HiddenInput />
                                        <Checkbox.Control />
                                        <Checkbox.Label>{c.name}</Checkbox.Label>
                                    </Checkbox.Root>
                                ))}
                            </Stack>
                            <PlayEdit
                                context="create"
                                isSubmitting={isPending}
                                initialPlay={initialPlay}
                                onCancel={() => props.setOpen(false)}
                                onSubmit={(vals) => {
                                    if (selected.length === 0) {
                                        toaster.create({ type: 'error', title: 'No clients selected', description: 'Select at least one client.' });
                                        return;
                                    }
                                    mutate({ play: vals.data, clients: selected.length === clients.length ? undefined : selected.map(x => x.uid) });
                                }}
                            />
                        </Stack>
                    </Dialog.Body>
                </Dialog.Content>
            </Dialog.Positioner>
        </Portal>
    </Dialog.Root>);
}

export const ManualScrobbleButton = () => {
    const [open, setOpen] = useState(false);
    return (<>
        <Button variant="subtle" onClick={() => setOpen(true)}>Scrobble manually</Button>
        <ManualScrobbleDialog open={open} setOpen={setOpen} />
    </>);
}
