import { loggerTest } from "@foxxmd/logging";
import { MSCache } from "../../common/Cache.js";

export const transientCache = () => new MSCache(loggerTest, {scrobble: {provider: 'memory'}});