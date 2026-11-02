import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ky, { HTTPError } from "ky";

/** Shape of GET api/auth/setup/status (src/backend/common/auth/setupPlugin.ts) */
export interface SetupStatus {
    mode: 'disabled' | 'optional'
    secured: boolean
    passwordSet: boolean
    setupTokenRequired: boolean
    isOwner: boolean
    /** omitted once secured unless logged in as the owner */
    username?: string
}

// the server injects <base href> with the runtime mount path so this resolves correctly at root or under a subpath
const authBaseUrl = () => new URL('api/auth', document.baseURI).toString();

export const authClient = createAuthClient({
    baseURL: authBaseUrl(),
    plugins: [usernameClient()],
});

export const setupStatusKey = ['auth', 'setupStatus'];

export const useSetupStatus = () => useQuery({
    queryKey: setupStatusKey,
    queryFn: () => ky.get('api/auth/setup/status').json<SetupStatus>(),
    staleTime: 30_000,
});

/** Refresh everything that depends on who the user is after logging in/out or changing setup state */
export const useRefreshAuth = () => {
    const queryClient = useQueryClient();
    const {refetch} = authClient.useSession();
    return async () => {
        await queryClient.invalidateQueries({queryKey: setupStatusKey});
        await refetch();
    }
}

/** Extract a human-friendly message from an error ({message} from better-auth, {error} from MS api) */
export const errorMessage = (e: unknown): string => {
    if (e instanceof HTTPError) {
        const data = e.data as {message?: string, error?: string} | string | undefined;
        if (typeof data === 'string' && data !== '') {
            return data;
        }
        if (typeof data === 'object' && data !== null) {
            return data.message ?? data.error ?? e.response.statusText;
        }
        return e.response.statusText;
    }
    if (typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string') {
        return e.message;
    }
    return String(e);
}

/**
 * Whether the current user can use the dashboard API (everything other than ingress/auth/health is gated once secured).
 *
 * `ready` is false until both setup status and session are known, so callers can avoid a flash of the login screen.
 * If setup status cannot be fetched access is assumed so the dashboard's own requests surface the error.
 * */
export const useHasAccess = (): {ready: boolean, hasAccess: boolean, hasSession: boolean} => {
    const {data: status, isLoading} = useSetupStatus();
    const {data: session, isPending} = authClient.useSession();
    const hasSession = session !== null && session !== undefined;
    const open = status === undefined || status.mode === 'disabled' || !status.secured;
    // session only matters when the instance is secured
    const ready = !isLoading && (open || !isPending);
    return {ready, hasAccess: open || hasSession, hasSession};
}
