import type { PlayEvent } from "../../../core/PlayEvent.ts"
import type { PlaySelectWithQueueStates, QueueStateSelect } from "../database/drizzle/drizzleTypes.ts"

export interface PlayProcessingResult {
    playEntity: PlaySelectWithQueueStates,
    events: Omit<PlayEvent, 'playId'>[],
    queue: QueueStateSelect
}