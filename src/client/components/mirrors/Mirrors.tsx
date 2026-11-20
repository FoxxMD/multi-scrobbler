import { Box, Button, Card, Container, DataList, Editable, Field, Flex, Heading, HStack, IconButton, Input, Link as ChakraLink, LinkBox, LinkOverlay, RadioGroup, SkeletonText, Stack, Text } from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import ky from 'ky';
import { useState, type ReactNode } from 'react';
import { LuCheck, LuPencil, LuX } from 'react-icons/lu';
import { Link, useNavigate, useParams } from "react-router";
import type { CleanupAction, MirrorApiJson } from "../../../core/Job";
import { tanQueries } from "../../queries";
import { baseUrl } from "../../utils";
import { ErrorAlert } from "../ErrorAlert";
import { MSErrorBoundary } from "../ErrorBoundary";
import { TextMuted } from "../TextMuted";
import { toaster } from "../Toaster";
import { CleanupButtons } from "../jobs/CleanupButtons";
import { apiErrorMessage, formatJobDate } from "../jobs/jobUtils";
import { CleanupProgress, formatRange, taskText, useMirrorEvents } from "./mirrorUtils";

const coverageSummary = (mirror: MirrorApiJson): string => mirror.coverage.length === 0
    ? 'Nothing imported'
    : formatRange([mirror.coverage[0][0], mirror.coverage[mirror.coverage.length - 1][1]]);

const accountText = (mirror: MirrorApiJson) => `${mirror.service === 'lastfm' ? 'Last.fm' : mirror.service}${mirror.account !== null ? `: ${mirror.account}` : ''}`;

export const MirrorSummary = (props: { mirror: MirrorApiJson }) => {
    const {mirror} = props;
    return (
        <Card.Root variant="subtle">
            <LinkBox>
                <Card.Header>
                    <LinkOverlay asChild>
                        <Link to={`/mirrors/${mirror.id}`}><Heading truncate>{mirror.name}</Heading></Link>
                    </LinkOverlay>
                    <TextMuted textStyle="sm" truncate>{accountText(mirror)}</TextMuted>
                </Card.Header>
                <Card.Body px="6" py="3">
                    <Stack gap="1">
                        <Text textStyle="sm">{mirror.plays.toLocaleString()} plays</Text>
                        <TextMuted textStyle="sm">{coverageSummary(mirror)}</TextMuted>
                        <TextMuted textStyle="sm">Used by {mirror.jobs.length} job{mirror.jobs.length === 1 ? '' : 's'}</TextMuted>
                        {mirror.task !== null ? <CleanupProgress task={mirror.task} text={taskText(mirror.task)}/> : undefined}
                    </Stack>
                </Card.Body>
            </LinkBox>
        </Card.Root>
    );
}

export const MirrorList = (props: { mirrors: MirrorApiJson[] }) => (
    <Container boxSize="full" p="0" maxWidth="8xl">
        <Stack gap="3">
            <Heading size="2xl">Mirrors</Heading>
            <TextMuted>Your Plays history copied from import jobs. Exports read from here.</TextMuted>
            {props.mirrors.length === 0 ? <TextMuted>No mirrors yet. <ChakraLink asChild><Link to="/jobs/new">Create a job</Link></ChakraLink> to import your history.</TextMuted> : undefined}
            <Box gridColumnGap="2" gridRowGap="2" display="grid" gridTemplateColumns={{mdDown: "repeat(1, minmax(295px, 1fr))", base: "repeat(auto-fill, minmax(295px, 1fr))"}}>
                {props.mirrors.map(x => <MSErrorBoundary key={x.id}><MirrorSummary mirror={x}/></MSErrorBoundary>)}
            </Box>
        </Stack>
    </Container>
);

export const MirrorListFetchable = () => {
    useMirrorEvents();
    const {isPending, isError, data, error} = useQuery(tanQueries.mirrors.list());
    if (isPending) {
        return <SkeletonText noOfLines={2}/>;
    }
    if (isError) {
        return <ErrorAlert error={error}/>;
    }
    return <MirrorList mirrors={data}/>;
}

const useSetMirror = () => {
    const queryClient = useQueryClient();
    return (mirror: MirrorApiJson) => {
        queryClient.setQueryData<MirrorApiJson>(tanQueries.mirrors.detail(mirror.id).queryKey, mirror);
        queryClient.setQueryData<MirrorApiJson[]>(tanQueries.mirrors.list().queryKey, (old) => old?.map(x => x.id === mirror.id ? mirror : x));
    };
}

const MirrorName = (props: { mirror: MirrorApiJson }) => {
    const {mirror} = props;
    const setMirror = useSetMirror();
    const {mutate, isPending} = useMutation({
        mutationFn: (name: string) => ky.patch(`mirrors/${mirror.id}`, {baseUrl, json: {name}}).json<MirrorApiJson>(),
        onSuccess: setMirror,
        onError: (e) => toaster.create({type: 'error', title: 'Rename failed', description: apiErrorMessage(e)}),
    });
    return (
        <Editable.Root key={mirror.name} defaultValue={mirror.name} maxLength={200} disabled={isPending} activationMode="dblclick" textStyle="2xl" fontWeight="semibold"
            onValueCommit={(details) => {
                const name = details.value.trim();
                if (name !== '' && name !== mirror.name) {
                    mutate(name);
                }
            }}>
            <Editable.Preview/>
            <Editable.Input/>
            <Editable.Control>
                <Editable.EditTrigger asChild><IconButton variant="ghost" size="xs" aria-label="Rename"><LuPencil/></IconButton></Editable.EditTrigger>
                <Editable.CancelTrigger asChild><IconButton variant="outline" size="xs" aria-label="Cancel"><LuX/></IconButton></Editable.CancelTrigger>
                <Editable.SubmitTrigger asChild><IconButton variant="outline" size="xs" aria-label="Save"><LuCheck/></IconButton></Editable.SubmitTrigger>
            </Editable.Control>
        </Editable.Root>
    );
}

const DataItem = (props: { label: string, children: ReactNode }) => (
    <DataList.Item>
        <DataList.ItemLabel>{props.label}</DataList.ItemLabel>
        <DataList.ItemValue>{props.children}</DataList.ItemValue>
    </DataList.Item>
);

const RangeList = (props: { ranges: [number, number][], empty: string }) => props.ranges.length === 0
    ? <Text>{props.empty}</Text>
    : <Stack gap="0">{props.ranges.map(r => <Text key={`${r[0]}`}>{formatRange(r)}</Text>)}</Stack>;

const MirrorCleanup = (props: { mirror: MirrorApiJson }) => {
    const {mirror} = props;
    const [scope, setScope] = useState<'all' | 'range'>('all');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const {mutate, isPending} = useMutation({
        mutationFn: (action: CleanupAction) => ky.post(`mirrors/${mirror.id}/cleanup`, {baseUrl, json: {
            action,
            range: scope === 'all' ? undefined : {from: dayjs(from).toISOString(), to: dayjs(to).endOf('minute').toISOString()},
        }}),
        onError: (e) => toaster.create({type: 'error', title: 'Could not start the cleanup', description: apiErrorMessage(e)}),
    });
    const rangeValid = scope === 'all' || (from !== '' && to !== '' && !dayjs(from).isAfter(dayjs(to)));
    const which = scope === 'all' ? 'all plays in this mirror' : 'plays in this mirror played in the range';
    return (
        <Stack gap="3">
            <RadioGroup.Root size="sm" value={scope} onValueChange={(d) => setScope(d.value as 'all' | 'range')}>
                <HStack gap="4">
                    <RadioGroup.Item value="all"><RadioGroup.ItemHiddenInput/><RadioGroup.ItemIndicator/><RadioGroup.ItemText>Everything</RadioGroup.ItemText></RadioGroup.Item>
                    <RadioGroup.Item value="range"><RadioGroup.ItemHiddenInput/><RadioGroup.ItemIndicator/><RadioGroup.ItemText>Played between</RadioGroup.ItemText></RadioGroup.Item>
                </HStack>
            </RadioGroup.Root>
            {scope === 'range' ? <Flex gap="3" wrap="wrap">
                <Field.Root width="auto"><Field.Label>From</Field.Label><Input size="sm" type="datetime-local" value={from} onChange={(e) => setFrom(e.currentTarget.value)}/></Field.Root>
                <Field.Root width="auto"><Field.Label>To</Field.Label><Input size="sm" type="datetime-local" value={to} onChange={(e) => setTo(e.currentTarget.value)}/></Field.Root>
            </Flex> : undefined}
            <CleanupButtons
                pending={isPending}
                disabledReason={mirror.task !== null ? 'A cleanup is running.' : (!rangeValid ? 'Choose a From date before the To date.' : undefined)}
                explain={{
                    compact: `Remove the raw data saved with ${which}. The Plays stay and can still be exported.`,
                    delete: `Delete ${which}. Importing that time again fetches them again.`,
                }}
                onConfirm={(action) => mutate(action)}
            />
        </Stack>
    );
}

const MirrorDelete = (props: { mirror: MirrorApiJson }) => {
    const {mirror} = props;
    const [confirming, setConfirming] = useState(false);
    const navigate = useNavigate();
    const {mutate, isPending} = useMutation({
        mutationFn: () => ky.delete(`mirrors/${mirror.id}`, {baseUrl}),
        onSuccess: () => navigate('/mirrors'),
        onError: (e) => toaster.create({type: 'error', title: 'Delete failed', description: apiErrorMessage(e)}),
    });
    if (mirror.jobs.length > 0) {
        return <TextMuted textStyle="sm" maxWidth="xs" textAlign="right">Delete the jobs using this mirror before deleting it.</TextMuted>;
    }
    if (!confirming) {
        return <Button size="sm" variant="subtle" colorPalette="red" disabled={mirror.task !== null} onClick={() => setConfirming(true)}>Delete</Button>;
    }
    return (
        <Stack gap="1" alignItems="flex-end">
            <Text textStyle="sm">Delete this mirror and its {mirror.plays.toLocaleString()} Plays?</Text>
            <HStack>
                <Button size="sm" variant="subtle" disabled={isPending} onClick={() => setConfirming(false)}>Cancel</Button>
                <Button size="sm" colorPalette="red" loading={isPending} onClick={() => mutate()}>Delete</Button>
            </HStack>
        </Stack>
    );
}

export const MirrorDetail = (props: { mirror: MirrorApiJson }) => {
    const {mirror} = props;
    return (
        <Stack gap="4">
            <HStack><Button asChild size="xs" variant="ghost"><Link to="/mirrors">← Mirrors</Link></Button></HStack>
            <Flex justify="space-between" alignItems="flex-start" gap="2" wrap="wrap">
                <MirrorName mirror={mirror}/>
                <MirrorDelete mirror={mirror}/>
            </Flex>
            <Card.Root variant="subtle">
                <Card.Body>
                    <Stack gap="4">
                        {mirror.task !== null ? <Stack gap="1"><CleanupProgress task={mirror.task} text={taskText(mirror.task)}/></Stack> : undefined}
                        <DataList.Root orientation="horizontal" size="sm">
                            <DataItem label="Account">{accountText(mirror)}</DataItem>
                            <DataItem label="Plays">{mirror.plays.toLocaleString()}</DataItem>
                            <DataItem label="Imported"><RangeList ranges={mirror.coverage} empty="Nothing yet"/></DataItem>
                            {mirror.gaps.length > 0 ? <DataItem label="Not imported"><RangeList ranges={mirror.gaps} empty="-"/></DataItem> : undefined}
                            <DataItem label="Jobs">
                                {mirror.jobs.length === 0 ? 'None' : <Stack gap="0">{mirror.jobs.map(j => <ChakraLink key={j.id} asChild><Link to={`/jobs/${j.id}`}>{j.name}</Link></ChakraLink>)}</Stack>}
                            </DataItem>
                            <DataItem label="Created">{formatJobDate(mirror.createdAt)}</DataItem>
                        </DataList.Root>
                    </Stack>
                </Card.Body>
            </Card.Root>
            <Card.Root variant="subtle">
                <Card.Header><Heading size="lg">Clean Up</Heading></Card.Header>
                <Card.Body>
                    <Stack gap="3">
                        <TextMuted textStyle="sm">Free up space once your exports are done. Jobs using this mirror can't import or export while a cleanup runs.</TextMuted>
                        <MirrorCleanup mirror={mirror}/>
                    </Stack>
                </Card.Body>
            </Card.Root>
        </Stack>
    );
}

export const MirrorDetailRoutable = () => {
    useMirrorEvents();
    const params = useParams();
    const mirrorId = Number.parseInt(params.mirrorId ?? '');
    const {isPending, isError, data, error} = useQuery({...tanQueries.mirrors.detail(mirrorId), enabled: !Number.isNaN(mirrorId)});
    let content: ReactNode;
    if (Number.isNaN(mirrorId)) {
        content = <ErrorAlert error={{message: `Not a mirror id: ${params.mirrorId}`}}/>;
    } else if (isPending) {
        content = <SkeletonText noOfLines={4}/>;
    } else if (isError) {
        content = <ErrorAlert error={error}/>;
    } else {
        content = <MirrorDetail mirror={data}/>;
    }
    return <Container boxSize="full" p="0" maxWidth="4xl">{content}</Container>;
}
