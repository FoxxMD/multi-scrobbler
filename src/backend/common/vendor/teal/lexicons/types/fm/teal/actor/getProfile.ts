import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as FmTealActorDefs from "./defs.ts";

const _mainSchema = /*#__PURE__*/ v.query("fm.teal.actor.getProfile", {
  params: /*#__PURE__*/ v.object({
    /**
     * The actor's DID or handle
     */
    actor: /*#__PURE__*/ v.actorIdentifierString(),
  }),
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      get actor() {
        return FmTealActorDefs.profileViewSchema;
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
    "fm.teal.actor.getProfile": mainSchema;
  }
}
