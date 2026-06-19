import { createQueryKeys, mergeQueryKeys } from "@lukemorales/query-key-factory";
import ky from 'ky';
import { QueryPlaysOpts } from "../../backend/common/database/drizzle/repositories/PlayRepository";
import { baseUrl } from "../utils";
import { PaginatedResponse } from "../../backend/common/database/drizzle/repositories/BaseRepository";
import { PlayApiCommonDetailed } from "../../core/Api";

const activities = createQueryKeys('activities', {
    list: (componentId: number, filters: QueryPlaysOpts) => ({
        queryKey: ['components', componentId, 'plays', filters],
        queryFn: (ctx) => ky.get(`components/${componentId}/plays`, {
       baseUrl: baseUrl,
       // @ts-expect-error
       searchParams: filters
      }).json<PaginatedResponse<PlayApiCommonDetailed>>()
    }),
    single: (componentId: number, activityUid: string) => ({
        queryKey: ['components', componentId, 'play', activityUid],
        queryFn: (ctx) => ky.get(`components/${componentId}/plays/${activityUid}`, { baseUrl }).json<PlayApiCommonDetailed>()
    })
})

export const tanQueries = mergeQueryKeys(activities);