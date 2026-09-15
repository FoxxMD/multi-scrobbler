import type { PlayEvent } from "../../../core/PlayEvent.ts"
import type { PlayWith, QueueStateSelect } from "../database/drizzle/drizzleTypes.ts"

export interface PlayProcessingResult {
    playEntity: PlayWith<'queueStates'|'events'>,
    events: Omit<PlayEvent, 'playId'>[],
    queue: QueueStateSelect
}