import { Logger } from "drizzle-orm";
import { DrizzleBaseRepository, DrizzleRepositoryOpts } from "./BaseRepository.js";
import { getDb } from "../drizzleUtils.js";
import { ComponentNew, ComponentSelect, FindWhere } from "../drizzleTypes.js";
import { components } from "../schema/schema.js";
import { generateComponentEntity } from "../entityUtils.js";

export class DrizzleComponentRepository extends DrizzleBaseRepository<'components'> {

    constructor(db: ReturnType<typeof getDb>, opts: DrizzleRepositoryOpts = {}) {
        super(db, 'components', 'Component', opts);
    }

    findOrInsert = async (data: { mode: 'source' | 'client', type: string, uid?: string, name?: string }): Promise<ComponentSelect> => {
        const where: FindWhere<'components'> = {
            mode: data.mode,
            type: data.type,
            uid: data.uid ?? data.name
        };
        const component = await this.db.query.components.findFirst({
            where
        });
        if (component !== undefined) {
            return component;
        }

        return (await this.db.insert(components).values(generateComponentEntity({
            uid: data.uid ?? data.name,
            mode: data.mode,
            type: data.type,
            name: data.name
        })).returning())[0];
    }
}