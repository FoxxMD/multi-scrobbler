import { generatePlay } from "../../../core/PlayTestUtils.js";
import { generateRandomObj } from "../../../core/tests/utils/fixtures.js";
import { generateComponentEntity, generateInputEntity, generatePlayEntity } from "../../common/database/drizzle/entityUtils.js";
import { ComponentNew, PlayInputNew, PlayNew } from "../../common/database/drizzle/schema/drizzlePlaysTable.js";

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
    return generatePlayEntity(play, {seenAt: play.data.playDate, ...rest});
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