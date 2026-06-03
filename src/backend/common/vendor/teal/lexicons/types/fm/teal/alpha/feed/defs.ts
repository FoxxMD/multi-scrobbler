import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";

const _artistSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("fm.teal.alpha.feed.defs#artist"),
  ),
  /**
   * The MusicBrainz artist ID URI, formatted as mbid:<uuid>
   */
  artistMbId: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.genericUriString()),
  /**
   * The name of the artist
   * @minLength 1
   * @maxLength 256
   * @maxGraphemes 2560
   */
  artistName: /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
    /*#__PURE__*/ v.stringLength(1, 256),
    /*#__PURE__*/ v.stringGraphemes(0, 2560),
  ]),
});
const _playViewSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("fm.teal.alpha.feed.defs#playView"),
  ),
  /**
   * Array of artists in order of original appearance.
   */
  get artists() {
    return /*#__PURE__*/ v.array(artistSchema);
  },
  /**
   * The length of the track in seconds
   */
  duration: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.integer()),
  /**
   * The ISRC code associated with the recording
   */
  isrc: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  /**
   * The base domain of the music service. e.g. music.apple.com, tidal.com, spotify.com. Defaults to 'local' if not provided.
   */
  musicServiceBaseDomain: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  /**
   * The URL associated with this track
   */
  originUrl: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.string()),
  /**
   * The unix timestamp of when the track was played
   */
  playedTime: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
  /**
   * The MusicBrainz recording ID URI of the track, formatted as mbid:<uuid>
   */
  recordingMbId: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.genericUriString()),
  /**
   * The MusicBrainz release ID URI, formatted as mbid:<uuid>
   */
  releaseMbId: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.genericUriString()),
  /**
   * The name of the release/album
   * @maxLength 256
   * @maxGraphemes 2560
   */
  releaseName: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
      /*#__PURE__*/ v.stringLength(0, 256),
      /*#__PURE__*/ v.stringGraphemes(0, 2560),
    ]),
  ),
  /**
   * A user-agent style string specifying the user agent. e.g. tealtracker/0.0.1b (Linux; Android 13; SM-A715F). Defaults to 'manual/unknown' if not provided.
   * @maxLength 256
   * @maxGraphemes 2560
   */
  submissionClientAgent: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
      /*#__PURE__*/ v.stringLength(0, 256),
      /*#__PURE__*/ v.stringGraphemes(0, 2560),
    ]),
  ),
  /**
   * The MusicBrainz ID URI of the track, formatted as mbid:<uuid>
   */
  trackMbId: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.genericUriString()),
  /**
   * The name of the track
   * @minLength 1
   * @maxLength 256
   * @maxGraphemes 2560
   */
  trackName: /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
    /*#__PURE__*/ v.stringLength(1, 256),
    /*#__PURE__*/ v.stringGraphemes(0, 2560),
  ]),
});

type artist$schematype = typeof _artistSchema;
type playView$schematype = typeof _playViewSchema;

export interface artistSchema extends artist$schematype {}
export interface playViewSchema extends playView$schematype {}

export const artistSchema = _artistSchema as artistSchema;
export const playViewSchema = _playViewSchema as playViewSchema;

export interface Artist extends v.InferInput<typeof artistSchema> {}
export interface PlayView extends v.InferInput<typeof playViewSchema> {}
