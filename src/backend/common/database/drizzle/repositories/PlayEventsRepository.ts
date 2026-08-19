import { DrizzleBaseRepository, type DrizzleRepositoryOpts } from "./BaseRepository.ts";
import type {DbConcrete} from "../drizzleUtils.ts";
export class DrizzlePlayEventsRepository extends DrizzleBaseRepository<'playEvents'> {

    constructor(db: DbConcrete, opts: DrizzleRepositoryOpts = {}) {
        super(db, 'playEvents', 'Play Events', opts);
    }
}