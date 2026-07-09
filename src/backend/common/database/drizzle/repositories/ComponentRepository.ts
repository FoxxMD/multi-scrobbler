import { type Logger } from "drizzle-orm";
import { DrizzleBaseRepository, type DrizzleRepositoryOpts } from "./BaseRepository.ts";
import { type DbConcrete } from "../drizzleUtils.ts";
import { type ComponentNew, type ComponentSelect, type FindWhere } from "../drizzleTypes.ts";
import { components } from "../schema/schema.ts";
import { generateComponentEntity } from "../entityUtils.ts";
import { type ComponentType } from "../../../../../core/Atomic.ts";

export class DrizzleComponentRepository extends DrizzleBaseRepository<'components'> {

    constructor(db: DbConcrete, opts: DrizzleRepositoryOpts = {}) {
        super(db, 'components', 'Component', opts);
    }

    findOrInsert = async (data: { mode: ComponentType, type: string, uid?: string, name?: string }): Promise<ComponentSelect> => {
        const where: FindWhere<'components'> = {
            mode: data.mode,
            type: data.type,
            uid: data.uid ?? data.name
        };
        const component = await this.db.query.components.findFirst({
            where,
            with: {
                migrations: true
            }
        });
        if (component !== undefined) {
            return component;
        }

        const componentNew = (await this.db.insert(components).values(generateComponentEntity({
            uid: data.uid ?? data.name,
            mode: data.mode,
            type: data.type,
            name: data.name
        })).returning())[0] as ComponentSelect;
        componentNew.migrations = [];
        return componentNew;
    }
}