import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as FmTealAlphaActorDefs from "./defs.ts";

const _mainSchema = /*#__PURE__*/ v.query("fm.teal.alpha.actor.getProfile", {
  params: /*#__PURE__*/ v.object({
    /**
     * The author's DID
     */
    actor: /*#__PURE__*/ v.actorIdentifierString(),
  }),
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      get actor() {
        return FmTealAlphaActorDefs.profileViewSchema;
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
    "fm.teal.alpha.actor.getProfile": mainSchema;
  }
}
