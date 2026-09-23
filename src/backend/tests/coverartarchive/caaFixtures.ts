import { faker } from "@faker-js/faker";
import { coverReleaseImageTypes, type CoverArtReleaseImage, type CoverArtReleaseResponse } from "../../common/vendor/musicbrainz/CoverArtApiTypes.ts";
import { generateArray } from "../../../core/DataUtils.ts";

export const generateCoverReleaseImageResponse = (partial: Partial<CoverArtReleaseImage> = {}): CoverArtReleaseImage => ({
    types: faker.helpers.arrayElements(coverReleaseImageTypes.options),
    front: faker.datatype.boolean(),
    back: faker.datatype.boolean(),
    approved: faker.datatype.boolean(),
    id: faker.number.int().toString(),
    edit: faker.number.int(),
    image: faker.internet.url(),
    comment: '',
    thumbnails: {
        "250": faker.internet.url(),
        "500": faker.internet.url(),
        "1200": faker.internet.url(),
        "small": faker.internet.url(),
        "large": faker.internet.url()
    },
    ...partial
})

export const generateCoverResponse = (partial: Partial<CoverArtReleaseResponse> = {}): CoverArtReleaseResponse => ({
    release: faker.internet.url(),
    images: generateArray(faker.number.int({ min: 1, max: 3 }), () => generateCoverReleaseImageResponse()),
    ...partial
})