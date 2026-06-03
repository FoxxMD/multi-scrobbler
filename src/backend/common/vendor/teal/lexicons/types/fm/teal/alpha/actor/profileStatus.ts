import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";

const _mainSchema = /*#__PURE__*/ v.record(
  /*#__PURE__*/ v.literal("self"),
  /*#__PURE__*/ v.object({
    $type: /*#__PURE__*/ v.literal("fm.teal.alpha.actor.profileStatus"),
    /**
     * The onboarding completion status
     */
    completedOnboarding: /*#__PURE__*/ v.string<
      | "complete"
      | "none"
      | "playOnboarding"
      | "profileOnboarding"
      | (string & {})
    >(),
    /**
     * The timestamp when this status was created
     */
    createdAt: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
    /**
     * The timestamp when this status was last updated
     */
    updatedAt: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
  }),
);

type main$schematype = typeof _mainSchema;

export interface mainSchema extends main$schematype {}

export const mainSchema = _mainSchema as mainSchema;

export interface Main extends v.InferInput<typeof mainSchema> {}

declare module "@atcute/lexicons/ambient" {
  interface Records {
    "fm.teal.alpha.actor.profileStatus": mainSchema;
  }
}
