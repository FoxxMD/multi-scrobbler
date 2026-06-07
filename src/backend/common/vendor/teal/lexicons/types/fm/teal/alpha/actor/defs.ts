import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import * as AppBskyRichtextFacet from "@atcute/bluesky/types/app/richtext/facet";
import * as FmTealAlphaActorProfile from "./profile.js";
import * as FmTealAlphaFeedDefs from "../feed/defs.js";

const _miniProfileViewSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("fm.teal.alpha.actor.defs#miniProfileView"),
  ),
  /**
   * IPLD of the avatar
   */
  avatar: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  /**
   * The decentralized identifier of the actor
   */
  did: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  displayName: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  handle: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
});
const _profileViewSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("fm.teal.alpha.actor.defs#profileView"),
  ),
  /**
   * IPLD of the avatar
   */
  avatar: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  /**
   * IPLD of the banner image
   */
  banner: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  createdAt: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
  /**
   * Free-form profile description text.
   */
  description: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  /**
   * Annotations of text in the profile description (mentions, URLs, hashtags, etc). May be changed to another (backwards compatible) lexicon.
   */
  get descriptionFacets() {
    return /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.array(AppBskyRichtextFacet.mainSchema),
    );
  },
  /**
   * The decentralized identifier of the actor
   */
  did: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  displayName: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  /**
   * The user's most recent item featured on their profile.
   */
  get featuredItem() {
    return /*#__PURE__*/ v.optional(FmTealAlphaActorProfile.featuredItemSchema);
  },
  get status() {
    return /*#__PURE__*/ v.optional(statusViewSchema);
  },
});
const _statusViewSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("fm.teal.alpha.actor.defs#statusView"),
  ),
  /**
   * The unix timestamp of the expiry time of the item. If unavailable, default to 10 minutes past the start time.
   */
  expiry: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
  get item() {
    return /*#__PURE__*/ v.optional(FmTealAlphaFeedDefs.playViewSchema);
  },
  /**
   * The unix timestamp of when the item was recorded
   */
  time: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
});

type miniProfileView$schematype = typeof _miniProfileViewSchema;
type profileView$schematype = typeof _profileViewSchema;
type statusView$schematype = typeof _statusViewSchema;

export interface miniProfileViewSchema extends miniProfileView$schematype {}
export interface profileViewSchema extends profileView$schematype {}
export interface statusViewSchema extends statusView$schematype {}

export const miniProfileViewSchema =
  _miniProfileViewSchema as miniProfileViewSchema;
export const profileViewSchema = _profileViewSchema as profileViewSchema;
export const statusViewSchema = _statusViewSchema as statusViewSchema;

export interface MiniProfileView extends v.InferInput<
  typeof miniProfileViewSchema
> {}
export interface ProfileView extends v.InferInput<typeof profileViewSchema> {}
export interface StatusView extends v.InferInput<typeof statusViewSchema> {}
