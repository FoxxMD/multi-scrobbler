import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as FmTealAlphaFeedDefs from "../feed/defs.js";

const _mainSchema = /*#__PURE__*/ v.record(
  /*#__PURE__*/ v.literal("self"),
  /*#__PURE__*/ v.object({
    $type: /*#__PURE__*/ v.literal("fm.teal.alpha.actor.status"),
    /**
     * The RFC 3339 formatted time of the expiry time of the item. If unavailable, default to 10 minutes past the start time.
     */
    expiry: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
    get item() {
      return FmTealAlphaFeedDefs.playViewSchema;
    },
    /**
     * The RFC 3339 formatted time of when the item was recorded
     */
    time: /*#__PURE__*/ v.datetimeString(),
  }),
);

type main$schematype = typeof _mainSchema;

export interface mainSchema extends main$schematype {}

export const mainSchema = _mainSchema as mainSchema;

export interface Main extends v.InferInput<typeof mainSchema> {}

declare module "@atcute/lexicons/ambient" {
  interface Records {
    "fm.teal.alpha.actor.status": mainSchema;
  }
}
