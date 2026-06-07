import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as FmTealAlphaFeedDefs from "./defs.js";

const _mainSchema = /*#__PURE__*/ v.query("fm.teal.alpha.feed.getPlay", {
  params: /*#__PURE__*/ v.object({
    /**
     * The author's DID for the play
     */
    authorDID: /*#__PURE__*/ v.actorIdentifierString(),
    /**
     * The record key of the play
     */
    rkey: /*#__PURE__*/ v.string(),
  }),
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      get play() {
        return FmTealAlphaFeedDefs.playViewSchema;
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
    "fm.teal.alpha.feed.getPlay": mainSchema;
  }
}
