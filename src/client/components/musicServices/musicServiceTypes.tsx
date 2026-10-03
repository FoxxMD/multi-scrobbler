import * as z from 'zod';

export const musicServiceName = z.enum(['spotify','musicbrainz','youtube','jellyfin','plex','listenbrainz','rocksky']);
export type MusicServiceName = z.infer<typeof musicServiceName>;

export const musicServiceBaseSchema = z.object({
    name: musicServiceName
});
export type MusicServiceBase = z.infer<typeof musicServiceBaseSchema>;

export const musicServiceIdBaseSchema = z.object({
    ...musicServiceBaseSchema.shape,
    id: z.string(),
    idHint: z.string().optional()
});
export type MusicServiceIdBase = z.infer<typeof musicServiceIdBaseSchema>;

export const musicServiceMBSchema = z.object({
    ...musicServiceIdBaseSchema.shape,
    name: z.literal(musicServiceName.enum.musicbrainz),
    idHint: z.enum(['recording','release','track','artist','release-group']).optional()
});
export type MusicServiceMB = z.infer<typeof musicServiceMBSchema>;

export const musicServiceNonMBSchema = z.object({
    ...musicServiceIdBaseSchema.shape,
    name: musicServiceName.exclude(['musicbrainz']),
});
export type MusicServiceNonMB = z.infer<typeof musicServiceNonMBSchema>;

export const musicServicesSchema = z.discriminatedUnion('name', [musicServiceMBSchema, musicServiceNonMBSchema]);
export type MusicServices = z.infer<typeof musicServicesSchema>;

export type MusicServicesAny = (MusicServices | MusicServiceBase);