import { createHydrator, hydrate, querySet } from "kysely-hydrate";
import { asPlay } from "../../../core/PlayMarshalUtils.js";
import { JsonPlayObject, REGEX_ISO8601_LOOSE } from "../../../core/Atomic.js";
import { Traverse } from "neotraverse/modern";
import dayjs from "dayjs";

const mapPlay = createHydrator<{id: string, play: JsonPlayObject}>()
	.extras({
        play: (data) => asPlay(data.play)
});

export const mapTimestamps = <T>(obj: Record<string, any>): T => {
    new Traverse(obj).forEach((ctx, x) => {
        if(ctx.notRoot) {
            return;
        }
        if (typeof x === 'string' && REGEX_ISO8601_LOOSE.test(x)) {
            ctx.update(dayjs(x), true);
        }
    });

    return obj as T;
}
