import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as FmTealAlphaFeedDefs from "./defs.ts";

const _mainSchema = /*#__PURE__*/ v.query("fm.teal.alpha.feed.getActorFeed", {
  params: /*#__PURE__*/ v.object({
    /**
     * The author's DID for the play
     */
    authorDID: /*#__PURE__*/ v.actorIdentifierString(),
    /**
     * The cursor to start the query from
     */
    cursor: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
    /**
     * The upper limit of tracks to get per request. Default is 20, max is 50.
     */
    limit: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
  }),
  output: {
    type: "lex",
    schema: /*#__PURE__*/ v.object({
      get plays() {
        return /*#__PURE__*/ v.array(FmTealAlphaFeedDefs.playViewSchema);
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
    "fm.teal.alpha.feed.getActorFeed": mainSchema;
  }
}
