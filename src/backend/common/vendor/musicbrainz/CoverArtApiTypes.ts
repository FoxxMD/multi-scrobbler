import * as z from "zod";
import { requestRetryOptionsSchema } from "../../infrastructure/config/common.ts";

const coverArtApiConfigSchema = z.object({
    /**
     * Use this api configuration?
     * 
     * @default true
     */
    enable: z.boolean().optional().meta({description: 'Use this api configuration? Default is `true`.'}),
    /**
     * Base URL of a Rocksky server. Leave unset to use the official Musicbrainz instance.
     * 
     */
    url: z.string().optional().meta({
        description: 'Base URL of a CoverArtArchive server. Leave unset to use the official CoverArtArchive instance.'
    }),
    /**
     * milliseconds to wait until throwing a timeout error when waiting for a response.
     * 
     * @default 6000
     */
    requestTimeout: z.int().optional().meta({
        description: 'milliseconds to wait until throwing a timeout error when waiting for a response. Default is `6000`ms.'
    }),
    rate: z.object({
        requests: z.number().positive().optional().meta({
            description: 'max number of requests allowed during perTime unit of time',
            default: 1
        }),
        perTime: z.number().positive().optional().meta({
            description: 'A span of time (in seconds) during which requests made me made, resets after perTime',
            default: 1
        })
    }).optional(),
    ...requestRetryOptionsSchema.shape
});
export type CoverArtApiConfig = z.infer<typeof coverArtApiConfigSchema>;

const covertArtApiClientConfig = z.object({
    apis: coverArtApiConfigSchema.array().optional()
});
export type CovertArtApiClientConfig = z.infer<typeof covertArtApiClientConfig>;

export const DEFAULT_CAA_URL = 'https://coverartarchive.org';

export const thumbSizes = z.enum(['250','500','1200','small','large']);
export type ThumbSizeEnum = z.infer<typeof thumbSizes>;
export type ThumbSize = 250 | 500 | 1200;
export const THUMB_SIZES = [250, 500, 1200];
export interface ThumbOptions {
    type?: 'front' | 'back';
    size?: ThumbSize;
    retries?: number;
}
export const thumbnailsSchema = z.partialRecord(thumbSizes, z.string());
export const coverReleaseImageTypes = z.enum(['Front','Back','Booklet']);
export type CoverReleaseImageTypes = z.infer<typeof coverReleaseImageTypes>;
const coverArtReleaseImageSchema = z.object({
    types: coverReleaseImageTypes.array(),
    front: z.boolean(),
    back: z.boolean(),
    image: z.string(),
    comment: z.string(),
    approved: z.boolean(),
    id: z.string(),
    edit: z.number(),
    thumbnails: thumbnailsSchema,
})
export type CoverArtReleaseImage = z.infer<typeof coverArtReleaseImageSchema>;
// export interface CoverArtReleaseImage {
//     types: ('Front' | 'Booklet' | 'Back')[];
//     front: boolean;
//     back: boolean;
//     image: string;
//     comment: string;
//     approve: boolean;
//     id: string;
//     thumbnails: {
//         250: string;
//         500: string;
//         1200: string;
//         small: string;
//         large: string;
//     };
// }
export interface CoverArtReleaseResponse {
    /** URL to musicbrainz release */
    release: string;
    images: CoverArtReleaseImage[];
}

export const caaArtType = z.enum(['front', 'back', 'booklet']);
export type CAAArtType = z.infer<typeof caaArtType>;

export const coverImageHas = (cover: CoverArtReleaseImage): {sizes: ThumbSizeEnum[], types: CAAArtType[]} => {
    const sizes: ThumbSizeEnum[] = Object.keys(cover.thumbnails).map(x => x.toString() as ThumbSizeEnum);
    const types: CAAArtType[] = [];
    if(cover.front === true || cover.types.includes(coverReleaseImageTypes.enum.Front)) {
        types.push('front');
    }
    if(cover.back === true || cover.types.includes(coverReleaseImageTypes.enum.Back)) {
        types.push('back');
    }
    if(cover.types.includes(coverReleaseImageTypes.enum.Booklet)) {
        types.push('booklet');
    }
    return {sizes, types};
}

