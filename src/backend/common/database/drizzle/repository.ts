import { Logger, LoggerAppExtras } from "@foxxmd/logging";
import { getDb, runTransaction } from "./drizzleUtils.js";
import { loggerNoop } from "../../MaybeLogger.js";
import { PlayObject } from "../../../../core/Atomic.js";
import { generateInputEntity, generatePlayEntity, PlayEntityOpts } from "./entityUtils.js";
import { PlayInputNew, playInputs, PlayNew, plays, PlaySelect } from "./schema/drizzlePlaysTable.js";
import { MarkOptional, MarkRequired } from "ts-essentials";
import { nanoid } from "nanoid";

export interface DrizzleRepositoryOpts {
    logger?: Logger
}

export type RepositoryCreatePlayOpts = PlayEntityOpts
    & {
        input: MarkOptional<PlayInputNew, 'playId' | 'play'>
    }
    & MarkRequired<Pick<PlayNew, 'play' | 'componentId'>, 'componentId'>;
export class DrizzleRepository {

    logger: Logger;
    db: ReturnType<typeof getDb>;

    constructor(db: ReturnType<typeof getDb>, opts: DrizzleRepositoryOpts = {}) {
        this.db = db;
        this.logger = opts.logger ?? loggerNoop;
    }

    createPlays = async (entitiesOpts: RepositoryCreatePlayOpts[]) => {

        let playRows: PlaySelect[];

        await runTransaction(this.db, async () => {

            const entitiesData = entitiesOpts.map((data) => {
                const {
                    play,
                    input,
                    ...rest
                } = data;
                return generatePlayEntity(play, { ...rest});
            });

            playRows = await this.db.insert(plays).values(entitiesData).returning();

            const inputDatas = playRows.map((x, index) => {
                const {
                    play,
                    input,
                } = entitiesOpts[index];
                const {
                    play: inputPlay = play,
                    ...restInput
                } = input;

                return generateInputEntity({ play: inputPlay, playId: x.id, ...restInput });
            });

            const inputRow = await this.db.insert(playInputs).values(inputDatas);

        });

        return playRows;
    }
}