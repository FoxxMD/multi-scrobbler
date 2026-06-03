import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as FmTealAlphaActorDefs from "./defs.js";

const _mainSchema = /*#__PURE__*/ v.query("fm.teal.alpha.actor.getProfiles", {
  params: /*#__PURE__*/ v.object({
    /**
     * Array of actor DIDs
     * @minLength 1
     */
    actors: /*#__PURE__*/ v.constrain(
      /*#__PURE__*/ v.array(/*#__PURE__*/ v.actorIdentifierString()),
      [/*#__PURE__*/ v.arrayLength(1)],
    ),
  }),
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      get actors() {
        return /*#__PURE__*/ v.array(
          FmTealAlphaActorDefs.miniProfileViewSchema,
        );
      },
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
    "fm.teal.alpha.actor.getProfiles": mainSchema;
  }
}
