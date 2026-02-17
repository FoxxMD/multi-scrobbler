import dayjs, { Dayjs } from "dayjs";
import { s32decode, s32encode } from '@atproto/common-web/dist/util.js';
import { randomInt } from "node:crypto";

// do not want to use @atcute/tid because it is dependency heavy, at least for arm64 builds
// requiring python and building bindings to get OS time using node-gyp-build (ugh)
// this isn't really being used yet anyway so just stubbing this with a naive implementation until it can be improved later
export const naiveTID = (time: number) => {
    const unix_micros = (time * 1000) + randomInt(999);
    const ts = s32encode(unix_micros).padStart(11,'2');
    const clock = s32encode(randomInt(32)).padStart(2, '2');
    return ts + clock;
}

export const decodeTIDToUnix = (tid: string) => {
    const timestampU = s32decode(tid.slice(0, 11));
    return Math.floor(timestampU / 1000);
}