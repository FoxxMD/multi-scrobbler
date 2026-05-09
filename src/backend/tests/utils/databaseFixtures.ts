import { generatePlay } from "../../../core/PlayTestUtils.js";
import { generateRandomObj } from "../../../core/tests/utils/fixtures.js";
import { generateComponentEntity, generateInputEntity, generatePlayEntity } from "../../common/database/drizzle/entityUtils.js";
import { PlayNew } from "../../common/database/drizzle/drizzleTypes.js";
import { PlayInputNew } from "../../common/database/drizzle/drizzleTypes.js";
import { ComponentNew } from "../../common/database/drizzle/drizzleTypes.js";
import { ObjectPlayData } from "../../../core/Atomic.js";
import { PGlite } from '@electric-sql/pglite'
import { dataDir } from '@electric-sql/pglite-prepopulatedfs'

export const fixtureCreateComponent = (data: Partial<ComponentNew> = {}): ComponentNew => {
    return generateComponentEntity(
        {
            uid: 'test',
            mode: 'source',
            type: 'jellyfin',
            name: 'myJelly',
            ...data
        });
}

export const fixtureCreatePlay = (data: Partial<PlayNew> = {}): PlayNew => {
    const {
        play = generatePlay(),
        ...rest
    } = data;
    return generatePlayEntity(play, {seenAt: play.meta.seenAt ?? play.data.playDate, updatedAt: play.meta.seenAt ?? play.data.playDate, ...rest});
}

export const fixtureCreateInput = (data: PlayInputNew & { data?: object | false }): PlayInputNew => {
    const {
        data: inputData = generateRandomObj(),
        ...rest
    } = data;
    let realData: undefined;
    if(inputData !== false) {
        realData = inputData;
    }
    return generateInputEntity({...rest, data: realData});
}

export const getPrepopulatedFSPGlite = async (dir: string) => {
    return PGlite.create({
        dataDir: dir,
        loadDataDir: await dataDir()
    });
}

export const getPrepopulatedMemoryPGlite = async () => {
    return PGlite.create({
        loadDataDir: await dataDir()
    });
}