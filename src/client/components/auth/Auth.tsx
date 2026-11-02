import { useState, type FormEvent, type PropsWithChildren } from "react";
import { Alert, Box, Button, Card, Field, Input, Link, Spinner, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ky from "ky";
import { Link as RouterLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { authClient, errorMessage, useHasAccess, useRefreshAuth, useSetupStatus } from "../../auth/authClient";

const AuthCard = (props: PropsWithChildren<{title: string, description?: string}>) => (
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
        <Field.HelperText>Printed in the multi-scrobbler logs on startup.</Field.HelperText>
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
                    <Button type="submit" loading={isPending}>Log in</Button>
                </Stack>
            </form>
        </AuthCard>
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
            description={'Set a password for the admin account. Afterwards, using the dashboard or API requires logging in. Scrobbling, ingress Sources (Listenbrainz/Last.fm endpoints, Webscrobbler) and health checks are not affected.'}>
            <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (!mismatch) { mutate(); } }}>
                <Stack gap="4">
                    <Field.Root>
                        <Field.Label>Username</Field.Label>
                        <Input value={status?.username ?? 'admin'} readOnly autoComplete="username"/>
                        <Field.HelperText>Change with the ADMIN_USERNAME environmental variable.</Field.HelperText>
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
                    {needsToken ? <SetupTokenField value={token} onChange={setToken}/> : null}
                    <FormError error={error !== null ? errorMessage(error) : undefined}/>
                    <Button type="submit" loading={isPending} disabled={mismatch || password === ''}>Set Password</Button>
                </Stack>
            </form>
        </AuthCard>
    );
}

export const NotSecuredBanner = () => (
    <Alert.Root status="warning" mb="4">
        <Alert.Indicator/>
        <Alert.Content>
            <Alert.Title>This instance is not secured</Alert.Title>
            <Alert.Description>
                Anyone who can reach this dashboard can view and change everything. <Link asChild variant="underline"><RouterLink to="/setup">Set an admin password</RouterLink></Link> or use ADMIN_SETUP_PW.
            </Alert.Description>
        </Alert.Content>
    </Alert.Root>
);

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
        return location.pathname === '/setup' ? <>{props.children}</> : <Box width="full"><NotSecuredBanner/>{props.children}</Box>;
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
                <Button type="submit" loading={isPending} disabled={mismatch || next === ''} alignSelf="flex-start">Change Password</Button>
            </Stack>
        </form>
    );
}
