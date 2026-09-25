import { DrizzleBaseRepository, type DrizzleRepositoryOpts } from "./BaseRepository.ts";
import type {DbConcrete} from "../drizzleUtils.ts";
import type {ComponentSelect, FindWhere} from "../drizzleTypes.ts";
import { components } from "../schema/schema.ts";
import { generateComponentEntity } from "../entityUtils.ts";
import type {ComponentType} from "../../../../../core/Atomic.ts";
import { eq, sql } from "drizzle-orm";

export class DrizzleComponentRepository extends DrizzleBaseRepository<'components'> {

    constructor(db: DbConcrete, opts: DrizzleRepositoryOpts = {}) {
        super(db, 'components', 'Component', opts);
    }

    findOrInsert = async (data: { mode: ComponentType, type: string, uid?: string, name: string }): Promise<ComponentSelect> => {
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

    /**
     * Add to the lifetime Discovered/Scrobbled total.
     *
     * The addition happens in SQL so each call builds on the stored value rather than on
     * a copy read at startup. Returns the new total.
     */
    incrementCountLive = async (id: number, by: number = 1): Promise<number> => {
        const res = await this.db.update(components)
            .set({ countLive: sql`${components.countLive} + ${by}` })
            .where(eq(components.id, id))
            .returning({ countLive: components.countLive });
        return res[0].countLive;
    }

    /**
     * Raise the lifetime total to at least `atLeast`, never lower it. Returns the resulting total.
     */
    raiseCountLive = async (id: number, atLeast: number): Promise<number> => {
        const res = await this.db.update(components)
            .set({ countLive: sql`max(${components.countLive}, ${atLeast})` })
            .where(eq(components.id, id))
            .returning({ countLive: components.countLive });
        return res[0].countLive;
    }
}