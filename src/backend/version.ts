import { getVersion } from "@foxxmd/get-version";

export let version: string = 'unknown';
export let stable: string = 'unknown';

export const parseVersion = async () => {
    version = await getVersion({ priority: ['env', 'git', 'file'] }) as string;
    stable = await getVersion({ priority: ['file'] }) as string;
    return version;
};

