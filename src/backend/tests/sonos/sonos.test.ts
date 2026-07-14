import { loggerDebug } from "@foxxmd/logging";
import EventEmitter from "events";
import { describe, it } from 'mocha';
import type {SonosData} from "../../common/infrastructure/config/source/sonos.ts";
import { SonosSource } from "../../sources/SonosSource.ts";
import * as dotenv from 'dotenv';
import path from 'path';
import { getPathFromCWD } from "../../common/index.ts";

const envPath = path.join(getPathFromCWD(), '.env');
dotenv.config({ path: envPath });

const createSource = async (data: SonosData): Promise<SonosSource> => {
    const source = new SonosSource('Test', {
        data,
        options: {}
    }, { localUrl: new URL('http://test'), configDir: 'test', logger: loggerDebug, version: 'test' }, new EventEmitter());
    await source.buildInitData();
    return source;
}

describe('#Sonos', function() {

    before(function () {
        if (process.env.SONOS_TEST !== 'true') {
            this.skip();
        }
    });

    it('does stuff', async function() {

        const s = await createSource({host: process.env.SONOS_HOST_TEST});
        await s.checkConnection();
        await s.getRecentlyPlayed();
        const f = 1;
    });

});