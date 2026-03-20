import { getVersion } from "@foxxmd/get-version";

export let version: string = 'unknown';

export const parseVersion = async () => {
    version = await getVersion({ priority: ['env', 'git', 'file'] });
    return version;
};

