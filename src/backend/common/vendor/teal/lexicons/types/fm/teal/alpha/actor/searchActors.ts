import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as FmTealAlphaActorDefs from "./defs.ts";

const _mainSchema = /*#__PURE__*/ v.query("fm.teal.alpha.actor.searchActors", {
  params: /*#__PURE__*/ v.object({
    /**
     * Cursor for pagination
     */
    cursor: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * The maximum number of actors to return
     * @minimum 1
     * @maximum 25
     */
    limit: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.integer(), [
        /*#__PURE__*/ v.integerRange(1, 25),
      ]),
    ),
    /**
     * The search query
     * @maxLength 640
     * @maxGraphemes 128
     */
    q: /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
      /*#__PURE__*/ v.stringLength(0, 640),
      /*#__PURE__*/ v.stringGraphemes(0, 128),
    ]),
  }),
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      get actors() {
        return /*#__PURE__*/ v.array(
          FmTealAlphaActorDefs.miniProfileViewSchema,
        );
      },
      /**
       * Cursor for pagination
       */
      cursor: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    }),
  },
});

type main$schematype = typeof _mainSchema;

export interface mainSchema extends main$schematype {}

export const mainSchema = _mainSchema as mainSchema;

export interface $params extends v.InferInput<mainSchema["params"]> {}
export interface $output extends v.InferXRPCBodyInput<mainSchema["output"]> {}

declare module "@atcute/lexicons/ambient" {
  interface XRPCQueries {
    "fm.teal.alpha.actor.searchActors": mainSchema;
  }
}
