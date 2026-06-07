import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";
import * as AppBskyRichtextFacet from "@atcute/bluesky/types/app/richtext/facet";

const _featuredItemSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("fm.teal.alpha.actor.profile#featuredItem"),
  ),
  /**
   * The MusicBrainz ID URI of the item, formatted as mbid:<uuid>
   */
  mbid: /*#__PURE__*/ v.genericUriString(),
  /**
   * The type of the item. Must be a valid Musicbrainz type, e.g. album, track, recording, etc.
   */
  type: /*#__PURE__*/ v.string(),
});
const _mainSchema = /*#__PURE__*/ v.record(
  /*#__PURE__*/ v.literal("self"),
  /*#__PURE__*/ v.object({
    $type: /*#__PURE__*/ v.literal("fm.teal.alpha.actor.profile"),
    /**
     * Small image to be displayed next to posts from account. AKA, 'profile picture'
     * @accept image/jpeg, image/png
     * @maxSize 1000000
     */
    avatar: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.blob(), [
        /*#__PURE__*/ v.blobSize(1000000),
        /*#__PURE__*/ v.blobAccept(["image/jpeg", "image/png"]),
      ]),
    ),
    /**
     * Larger horizontal image to display behind profile view.
     * @accept image/jpeg, image/png
     * @maxSize 1000000
     */
    banner: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.blob(), [
        /*#__PURE__*/ v.blobSize(1000000),
        /*#__PURE__*/ v.blobAccept(["image/jpeg", "image/png"]),
      ]),
    ),
    createdAt: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
    /**
     * Free-form profile description text.
     * @maxLength 2560
     * @maxGraphemes 256
     */
    description: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
        /*#__PURE__*/ v.stringLength(0, 2560),
        /*#__PURE__*/ v.stringGraphemes(0, 256),
      ]),
    ),
    /**
     * Annotations of text in the profile description (mentions, URLs, hashtags, etc).
     */
    get descriptionFacets() {
      return /*#__PURE__*/ v.optional(
        /*#__PURE__*/ v.array(AppBskyRichtextFacet.mainSchema),
      );
    },
    /**
     * @maxLength 640
     * @maxGraphemes 64
     */
    displayName: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
        /*#__PURE__*/ v.stringLength(0, 640),
        /*#__PURE__*/ v.stringGraphemes(0, 64),
      ]),
    ),
    /**
     * The user's most recent item featured on their profile.
     */
    get featuredItem() {
      return /*#__PURE__*/ v.optional(featuredItemSchema);
    },
  }),
);

type featuredItem$schematype = typeof _featuredItemSchema;
type main$schematype = typeof _mainSchema;

export interface featuredItemSchema extends featuredItem$schematype {}
export interface mainSchema extends main$schematype {}

export const featuredItemSchema = _featuredItemSchema as featuredItemSchema;
export const mainSchema = _mainSchema as mainSchema;

export interface FeaturedItem extends v.InferInput<typeof featuredItemSchema> {}
export interface Main extends v.InferInput<typeof mainSchema> {}

declare module "@atcute/lexicons/ambient" {
  interface Records {
    "fm.teal.alpha.actor.profile": mainSchema;
  }
}
