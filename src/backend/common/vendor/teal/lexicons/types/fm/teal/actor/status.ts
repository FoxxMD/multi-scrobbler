import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as FmTealFeedDefs from "../feed/defs.ts";

const _mainSchema = /*#__PURE__*/ v.record(
  /*#__PURE__*/ v.literal("self"),
  /*#__PURE__*/ v.object({
    $type: /*#__PURE__*/ v.literal("fm.teal.actor.status"),
    /**
     * The datetime after which the status is no longer current. If unavailable, default to 10 minutes after the start time.
     */
    expiry: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
    get item() {
      return FmTealFeedDefs.playViewSchema;
    },
    /**
     * The datetime at which the status was recorded.
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
    "fm.teal.actor.status": mainSchema;
  }
}
