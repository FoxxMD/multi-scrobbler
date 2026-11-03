import React, { useState, type FormEvent, type PropsWithChildren } from "react";
import { Alert, Badge, Box, Button, Card, Code, Field, Heading, HStack, Input, Link, NativeSelect, Spinner, Stack, Table, Text, Span } from "@chakra-ui/react";
import { ChakraClip } from "../ChakraClipboard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ky from "ky";
import { Link as RouterLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { authClient, errorMessage, useHasAccess, useRefreshAuth, useSetupStatus, type SetupStatus } from "../../auth/authClient";

const AuthCard = (props: PropsWithChildren<{title: string, description?: string | React.JSX.Element}>) => (
    <Box display="flex" justifyContent="center" width="full" py="8">
        <Card.Root width="full" maxWidth="md">
            <Card.Header>
                <Card.Title>{props.title}</Card.Title>
                {props.description !== undefined ? <Card.Description>{props.description}</Card.Description> : null}
            </Card.Header>
            <Card.Body>{props.children}</Card.Body>
        </Card.Root>
    </Box>
);

const FormError = (props: {error?: string}) => props.error === undefined ? null : (
    <Alert.Root status="error">
        <Alert.Indicator/>
        <Alert.Title>{props.error}</Alert.Title>
    </Alert.Root>
);

const SetupTokenField = (props: {value: string, onChange: (val: string) => void}) => (
    <Field.Root required>
        <Field.Label>Setup Token</Field.Label>
        <Input value={props.value} onChange={(e) => props.onChange(e.target.value)} autoComplete="off"/>
        <Field.HelperText>Printed on startup in the multi-scrobbler console output, docker logs, or log file. It is hidden from the dashboard logs.</Field.HelperText>
    </Field.Root>
);

export const LoginForm = () => {
    const {data: status} = useSetupStatus();
    const refresh = useRefreshAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const {hasSession} = useHasAccess();
    const [username, setUsername] = useState<string | undefined>(undefined);
    const [password, setPassword] = useState('');

    const {mutate, isPending, error} = useMutation({
        mutationFn: async () => {
            const res = await authClient.signIn.username({username: username ?? status?.username ?? '', password});
            if (res.error !== null) {
                throw new Error(res.error.message ?? 'Invalid username or password');
            }
        },
        onSuccess: async () => {
            await refresh();
            if (location.pathname === '/login') {
                navigate('/');
            }
        }
    });

    if (status !== undefined && !status.secured) {
        return <Navigate to="/setup"/>;
    }
    if (hasSession && location.pathname === '/login') {
        return <Navigate to="/"/>;
    }

    return (
        <AuthCard title="Log in">
            <form onSubmit={(e: FormEvent) => { e.preventDefault(); mutate(); }}>
                <Stack gap="4">
                    <Field.Root required>
                        <Field.Label>Username</Field.Label>
                        <Input value={username ?? status?.username ?? ''} onChange={(e) => setUsername(e.target.value)} autoComplete="username"/>
                    </Field.Root>
                    <Field.Root required>
                        <Field.Label>Password</Field.Label>
                        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus/>
                    </Field.Root>
                    <FormError error={error !== null ? errorMessage(error) : undefined}/>
                    <Box display="flex" justifyContent="right" width="full">
                    <Button type="submit" loading={isPending}>Log in</Button>
                    </Box>
                </Stack>
            </form>
        </AuthCard>
    );
}

/** Explains why the setup token is needed, and the other ways to secure the instance */
const SetupTokenReason = (props: {status: SetupStatus}) => {
    const {setupTokenReason: reason, host} = props.status;
    if (reason !== 'public_ip' && reason !== 'host') {
        return null;
    }
    return (
        <Alert.Root status="info">
            <Alert.Indicator/>
            <Alert.Content>
                <Alert.Title>Setup token required</Alert.Title>
                <Alert.Description>
                    <Stack>
                    {reason === 'public_ip'
                        ? <Text>You appear to be connecting from the internet. To make sure only someone with access to the server can secure this instance, enter the setup token.</Text>
                        : <><Text>You are using this instance through <strong>{host}</strong>, which is not a recognized host, so a setup token is required.</Text><Text>To avoid setup token: open this page using the server's IP address, or add the host to <Code>ALLOWED_HOSTS</Code> or <Code>BASE_URL</Code>.</Text></>}
                    <Text>You can also skip this step by using the <Code>ADMIN_SETUP_PW</Code> environmental variable.</Text>
                    </Stack>
                </Alert.Description>
            </Alert.Content>
        </Alert.Root>
    );
}

/** Set the owner's first password (the "secure this instance" page) */
export const SetPasswordForm = () => {
    const {data: status} = useSetupStatus();
    const refresh = useRefreshAuth();
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [token, setToken] = useState('');

    const needsToken = status?.setupTokenRequired === true && status.isOwner !== true;
    const mismatch = confirm !== '' && password !== confirm;

    const {mutate, isPending, error} = useMutation({
        mutationFn: () => ky.post('api/auth/setup/password', {json: {password, token: needsToken ? token : undefined}}),
        onSuccess: async () => {
            await refresh();
            navigate('/');
        }
    });

    if (status?.passwordSet === true) {
        return <Navigate to="/"/>;
    }

    return (
        <AuthCard
            title="Secure this instance"
            description={<Stack><Text>Set a password for the admin account.</Text><Text>Afterwards, using the dashboard or API requires logging in.</Text></Stack>}>
            <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (!mismatch) { mutate(); } }}>
                <Stack gap="4">
                    <Field.Root>
                        <Field.Label>Username</Field.Label>
                        <Input value={status?.username ?? 'admin'} readOnly autoComplete="username"/>
                        <Field.HelperText>Change with the <Code>ADMIN_USERNAME</Code> environmental variable.</Field.HelperText>
                    </Field.Root>
                    <Field.Root required>
                        <Field.Label>Password</Field.Label>
                        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus/>
                        <Field.HelperText>At least 8 characters.</Field.HelperText>
                    </Field.Root>
                    <Field.Root required invalid={mismatch}>
                        <Field.Label>Confirm Password</Field.Label>
                        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"/>
                        <Field.ErrorText>Passwords do not match</Field.ErrorText>
                    </Field.Root>
                    {needsToken && status !== undefined ? <SetupTokenReason status={status}/> : null}
                    {needsToken ? <SetupTokenField value={token} onChange={setToken}/> : null}
                    <FormError error={error !== null ? errorMessage(error) : undefined}/>
                    <Button type="submit" loading={isPending} disabled={mismatch || password === ''}>Set Password</Button>
                </Stack>
            </form>
        </AuthCard>
    );
}

export const NotSecuredBanner = (props: {status: SetupStatus}) => {
    const {publicClient, hostRecognized, host} = props.status;
    return (
        <Alert.Root status='warning' mb="4">
            <Alert.Indicator/>
            <Alert.Content>
                <Alert.Title>{publicClient ? 'This instance may be reachable from the internet and is not secured!' : 'This instance is not secured!'}</Alert.Title>
                <Alert.Description>
                    <Stack>
                    {publicClient
                        ? 'You appear to be connecting from the internet. Anyone who can reach this instance can use it.'
                        : 'Anyone who can reach this dashboard can view and change everything.'}
                    <Span><Link asChild variant="underline"><RouterLink to="/setup">Set an admin password</RouterLink></Link> or use ENV<Code>ADMIN_SETUP_PW</Code></Span>
                    <Span>{hostRecognized ? null : <> Because you are using it through <strong>{host}</strong>, which it does not recognize, it is <strong>read-only</strong> until it is secured or the host is added to <Code>ALLOWED_HOSTS</Code> or <Code>BASE_URL</Code>.</>}</Span>
                </Stack>
                </Alert.Description>
            </Alert.Content>
        </Alert.Root>
    );
}

/**
 * Decides what the dashboard shows based on auth state:
 *
 * * not secured -> normal dashboard with a warning banner
 * * secured without a session -> login form (in place, so the current route is kept after logging in)
 * * otherwise the normal dashboard
 * */
export const AuthGate = (props: PropsWithChildren) => {
    const {data: status} = useSetupStatus();
    const {ready, hasSession} = useHasAccess();
    const location = useLocation();

    if (!ready) {
        return <Box width="full" display="flex" justifyContent="center" py="8"><Spinner/></Box>;
    }
    // if status cannot be fetched let the dashboard render, its own requests will surface any errors
    if (status === undefined || status.mode === 'disabled') {
        return <>{props.children}</>;
    }
    if (!status.secured) {
        return location.pathname === '/setup' ? <>{props.children}</> : <Box width="full"><NotSecuredBanner status={status}/>{props.children}</Box>;
    }
    if (!hasSession && location.pathname !== '/login') {
        return <LoginForm/>;
    }
    return <>{props.children}</>;
}

/** Header element: current user and log out, or a log in link */
export const AuthMenu = () => {
    const {data: status} = useSetupStatus();
    const {data: session} = authClient.useSession();
    const refresh = useRefreshAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    if (status === undefined || status.mode === 'disabled' || !status.secured) {
        return null;
    }
    if (session === null || session === undefined) {
        return <Button asChild size="xs" variant="outline"><RouterLink to="/login">Log in</RouterLink></Button>;
    }
    return (
        <Stack direction="row" alignItems="center" gap="2">
            <Text hideBelow="md" fontSize="sm">{(session.user as {username?: string}).username ?? session.user.name}</Text>
            <Button size="xs" variant="ghost" onClick={async () => {
                await authClient.signOut();
                // dashboard data must not be shown (from cache) after logging out
                queryClient.removeQueries({predicate: (q) => q.queryKey[0] !== 'auth'});
                await refresh();
                navigate('/');
            }}>Log out</Button>
        </Stack>
    );
}

/** Settings section: change password for a logged in user, or point to setup when the instance is not secured */
export const AccountSettings = () => {
    const queryClient = useQueryClient();
    const {data: status} = useSetupStatus();
    const {data: session} = authClient.useSession();
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const mismatch = confirm !== '' && next !== confirm;

    const {mutate, isPending, error, isSuccess, reset} = useMutation({
        mutationFn: async () => {
            const res = await authClient.changePassword({currentPassword: current, newPassword: next, revokeOtherSessions: true});
            if (res.error !== null) {
                throw new Error(res.error.message ?? 'Could not change password');
            }
        },
        onSuccess: () => {
            setCurrent('');
            setNext('');
            setConfirm('');
            queryClient.invalidateQueries({queryKey: ['sessions']});
        }
    });

    if (status === undefined || status.mode === 'disabled') {
        return <Text>Authentication is disabled (AUTH_MODE=disabled).</Text>;
    }
    if (!status.secured) {
        return <Text>This instance is not secured. <Link asChild variant="underline"><RouterLink to="/setup">Set an admin password</RouterLink></Link></Text>;
    }
    if (session === null || session === undefined) {
        return <Text><Link asChild variant="underline"><RouterLink to="/login">Log in</RouterLink></Link> to manage your account.</Text>;
    }

    return (
        <Stack gap="6" width="full">
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (!mismatch) { reset(); mutate(); } }}>
            <Stack gap="4" maxWidth="sm">
                <Text>Logged in as <strong>{(session.user as {username?: string}).username ?? session.user.name}</strong></Text>
                <Field.Root required>
                    <Field.Label>Current Password</Field.Label>
                    <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password"/>
                </Field.Root>
                <Field.Root required>
                    <Field.Label>New Password</Field.Label>
                    <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password"/>
                </Field.Root>
                <Field.Root required invalid={mismatch}>
                    <Field.Label>Confirm New Password</Field.Label>
                    <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"/>
                    <Field.ErrorText>Passwords do not match</Field.ErrorText>
                </Field.Root>
                <FormError error={error !== null ? errorMessage(error) : undefined}/>
                {isSuccess ? <Alert.Root status="success"><Alert.Indicator/><Alert.Title>Password changed. Other sessions were logged out.</Alert.Title></Alert.Root> : null}
                <Box display="flex" justifyContent="right" width="full">
                <Button type="submit" loading={isPending} disabled={mismatch || next === ''} alignSelf="flex-start">Change Password</Button>
                </Box>
            </Stack>
        </form>
        <SessionList currentSessionId={session.session.id}/>
        <ApiKeyList/>
        </Stack>
    );
}

const formatDate = (d: Date | string) => new Date(d).toLocaleString();

/** Active sessions of the logged in user, with revoke */
const SessionList = (props: {currentSessionId: string}) => {
    const queryClient = useQueryClient();
    const {data: sessions, error, isLoading} = useQuery({
        queryKey: ['sessions'],
        queryFn: async () => {
            const res = await authClient.listSessions();
            if (res.error !== null) {
                // better-auth only lists sessions for a recent login (freshAge)
                throw new Error(res.error.code === 'SESSION_NOT_FRESH'
                    ? 'For security, viewing sessions requires a recent login. Log out and log in again to manage sessions.'
                    : res.error.message ?? 'Could not load sessions');
            }
            return res.data;
        },
        retry: false,
    });

    const revoke = useMutation({
        mutationFn: async (token: string | undefined) => {
            const res = token === undefined ? await authClient.revokeOtherSessions() : await authClient.revokeSession({token});
            if (res.error !== null) {
                throw new Error(res.error.message ?? 'Could not log out session');
            }
        },
        onSettled: () => queryClient.invalidateQueries({queryKey: ['sessions']}),
    });

    return (
        <Stack gap="3" width="full">
            <Heading size="md">Sessions</Heading>
            <Text fontSize="sm">Devices and browsers currently logged in. Logging out a session takes effect immediately.</Text>
            {isLoading ? <Spinner/> : null}
            <FormError error={error !== null ? errorMessage(error) : undefined}/>
            <FormError error={revoke.error !== null ? errorMessage(revoke.error) : undefined}/>
            {sessions !== undefined ? (
                <>
                    <Table.ScrollArea borderWidth="1px" rounded="md">
                        <Table.Root size="sm">
                            <Table.Header>
                                <Table.Row>
                                    <Table.ColumnHeader>Device</Table.ColumnHeader>
                                    <Table.ColumnHeader>IP</Table.ColumnHeader>
                                    <Table.ColumnHeader>Logged in</Table.ColumnHeader>
                                    <Table.ColumnHeader>Last active</Table.ColumnHeader>
                                    <Table.ColumnHeader>Expires</Table.ColumnHeader>
                                    <Table.ColumnHeader/>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {sessions.map((s) => (
                                    <Table.Row key={s.id}>
                                        <Table.Cell maxWidth="xs" truncate title={s.userAgent ?? undefined}>{s.userAgent ?? 'Unknown'}</Table.Cell>
                                        <Table.Cell>{s.ipAddress ?? 'Unknown'}</Table.Cell>
                                        <Table.Cell>{formatDate(s.createdAt)}</Table.Cell>
                                        <Table.Cell>{formatDate(s.updatedAt)}</Table.Cell>
                                        <Table.Cell>{formatDate(s.expiresAt)}</Table.Cell>
                                        <Table.Cell textAlign="end">
                                            {s.id === props.currentSessionId
                                                ? <Text fontSize="sm" color="fg.muted">This session</Text>
                                                : <Button size="xs" variant="outline" loading={revoke.isPending && revoke.variables === s.token} onClick={() => revoke.mutate(s.token)}>Log out</Button>}
                                        </Table.Cell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table.Root>
                        </Table.ScrollArea>
                    <Box display="flex" justifyContent="right" width="full">
                    {sessions.length > 1 ? (
                        <Button size="sm" variant="outline" alignSelf="flex-start" loading={revoke.isPending && revoke.variables === undefined} onClick={() => revoke.mutate(undefined)}>Log out all other sessions</Button>
                    ) : null}
                    </Box>
                </>
            ) : null}
        </Stack>
    );
}

type ApiKeyScope = 'read' | 'write';
/** same fail-closed rule as the server (apiKeyScope in src/backend/server/requireAuth.ts) */
const keyScope = (metadata: unknown): ApiKeyScope => (metadata as {scope?: unknown} | null)?.scope === 'write' ? 'write' : 'read';

/** API keys of the logged in user, with create and delete */
const ApiKeyList = () => {
    const queryClient = useQueryClient();
    const [name, setName] = useState('');
    const [scope, setScope] = useState<ApiKeyScope>('read');
    const [created, setCreated] = useState<string | undefined>();

    const {data: keys, error, isLoading} = useQuery({
        queryKey: ['apiKeys'],
        queryFn: async () => {
            const res = await authClient.apiKey.list();
            if (res.error !== null) {
                throw new Error(res.error.message ?? 'Could not load API keys');
            }
            return res.data.apiKeys;
        },
        retry: false,
    });

    const create = useMutation({
        mutationFn: async () => {
            const res = await authClient.apiKey.create({name, metadata: {scope}});
            if (res.error !== null) {
                throw new Error(res.error.message ?? 'Could not create API key');
            }
            return res.data.key;
        },
        onSuccess: (key) => {
            setCreated(key);
            setName('');
        },
        onSettled: () => queryClient.invalidateQueries({queryKey: ['apiKeys']}),
    });

    const remove = useMutation({
        mutationFn: async (keyId: string) => {
            const res = await authClient.apiKey.delete({keyId});
            if (res.error !== null) {
                throw new Error(res.error.message ?? 'Could not delete API key');
            }
        },
        onSettled: () => queryClient.invalidateQueries({queryKey: ['apiKeys']}),
    });

    return (
        <Stack gap="3" width="full">
            <Heading size="md">API Keys</Heading>
            <Text fontSize="sm">Send as <Code>Authorization: Bearer &lt;key&gt;</Code>. <strong>Read</strong> keys can only make GET requests, <strong>Write</strong> keys can do everything.</Text>
            {isLoading ? <Spinner/> : null}
            <FormError error={error !== null ? errorMessage(error) : undefined}/>
            <FormError error={remove.error !== null ? errorMessage(remove.error) : undefined}/>
            {keys !== undefined && keys.length > 0 ? (
                <Table.ScrollArea borderWidth="1px" rounded="md">
                    <Table.Root size="sm">
                        <Table.Header>
                            <Table.Row>
                                <Table.ColumnHeader>Name</Table.ColumnHeader>
                                <Table.ColumnHeader>Key</Table.ColumnHeader>
                                <Table.ColumnHeader>Scope</Table.ColumnHeader>
                                <Table.ColumnHeader>Created</Table.ColumnHeader>
                                <Table.ColumnHeader>Last used</Table.ColumnHeader>
                                <Table.ColumnHeader/>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {keys.map((k) => (
                                <Table.Row key={k.id}>
                                    <Table.Cell>{k.name}</Table.Cell>
                                    <Table.Cell><Code>{k.start ?? ''}…</Code></Table.Cell>
                                    <Table.Cell>{keyScope(k.metadata) === 'write' ? <Badge colorPalette="orange">Write</Badge> : <Badge>Read</Badge>}</Table.Cell>
                                    <Table.Cell>{formatDate(k.createdAt)}</Table.Cell>
                                    <Table.Cell>{k.lastRequest ? formatDate(k.lastRequest) : 'Never'}</Table.Cell>
                                    <Table.Cell textAlign="end">
                                        <Button size="xs" variant="outline" colorPalette="red" loading={remove.isPending && remove.variables === k.id} onClick={() => remove.mutate(k.id)}>Delete</Button>
                                    </Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table.Root>
                </Table.ScrollArea>
            ) : null}
            {created !== undefined ? (
                <Alert.Root status="success">
                    <Alert.Indicator/>
                    <Alert.Content>
                        <Alert.Title>API key created. Copy it now, it will not be shown again.</Alert.Title>
                        <Alert.Description>
                            <HStack><Code wordBreak="break-all">{created}</Code><ChakraClip value={created}/></HStack>
                        </Alert.Description>
                    </Alert.Content>
                </Alert.Root>
            ) : null}
            <form onSubmit={(e: FormEvent) => { e.preventDefault(); setCreated(undefined); create.mutate(); }}>
                <HStack gap="3" alignItems="flex-end" flexWrap="wrap">
                    <Field.Root required maxWidth="xs">
                        <Field.Label>Name</Field.Label>
                        <Input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="prometheus"/>
                    </Field.Root>
                    <Field.Root maxWidth="40">
                        <Field.Label>Scope</Field.Label>
                        <NativeSelect.Root>
                            <NativeSelect.Field value={scope} onChange={(e) => setScope(e.target.value as ApiKeyScope)}>
                                <option value="read">Read</option>
                                <option value="write">Write</option>
                            </NativeSelect.Field>
                            <NativeSelect.Indicator/>
                        </NativeSelect.Root>
                    </Field.Root>
                    <Button type="submit" loading={create.isPending} disabled={name.trim() === ''}>Create API Key</Button>
                </HStack>
            </form>
            <FormError error={create.error !== null ? errorMessage(create.error) : undefined}/>
        </Stack>
    );
}
