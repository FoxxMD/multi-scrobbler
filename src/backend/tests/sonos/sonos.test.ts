import { loggerTest, loggerDebug } from "@foxxmd/logging";
import { assert, expect } from 'chai';
import EventEmitter from "events";
import { describe, it } from 'mocha';
import { SonosData } from "../../common/infrastructure/config/source/sonos.js";
import { SonosSource } from "../../sources/SonosSource.js";
import * as dotenv from 'dotenv';
import path from 'path';
import { projectDir } from "../../common/index.js";

const envPath = path.join(projectDir, '.env');
dotenv.config({ path: envPath });

const createSource = async (data: SonosData): Promise<SonosSource> => {
    const source = new SonosSource('Test', {
        data,
        options: {}
    }, { localUrl: new URL('http://test'), configDir: 'test', logger: loggerDebug, version: 'test' }, new EventEmitter());
    await source.buildInitData();
    return source;
}

// it('does stuff', async function() {

//     const s = await createSource({host: process.env.SONOS_HOST});
//     await s.checkConnection();
//     await s.getRecentlyPlayed();
//     const f = 1;
// });