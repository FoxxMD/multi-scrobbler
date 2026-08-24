import { getVersion } from "@foxxmd/get-version";

export let version: string = 'unknown';
export let stable: string = 'unknown';

export const parseVersion = async () => {
    version = await getVersion({ priority: ['env', 'git', 'file'] });
    stable = await getVersion({ priority: ['file'] });
    return version;
};

