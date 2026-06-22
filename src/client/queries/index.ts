import { createQueryKeys, mergeQueryKeys } from "@lukemorales/query-key-factory";
import ky from 'ky';
import { QueryPlaysOpts, QueryPlaysOptsJson } from "../../backend/common/database/drizzle/repositories/PlayRepository";
import qs from 'qs';
import { baseUrl } from "../utils";
import { PaginatedResponse } from "../../backend/common/database/drizzle/repositories/BaseRepository";
import { PlayApiCommonDetailed } from "../../core/Api";

const activities = createQueryKeys('activities', {
    list: (componentId: number, filters: QueryPlaysOptsJson) => ({
        queryKey: ['components', componentId, 'plays', filters],
        queryFn: (ctx) => {
            return ky.get(`components/${componentId}/plays`, {
       baseUrl: baseUrl,
       searchParams: qs.stringify({...filters, offset: ctx.pageParam})
      }).json<PaginatedResponse<PlayApiCommonDetailed>>()
    }
    }),
    single: (componentId: number, activityUid: string) => ({
        queryKey: ['components', componentId, 'play', activityUid],
        queryFn: (ctx) => ky.get(`components/${componentId}/plays/${activityUid}`, { baseUrl }).json<PlayApiCommonDetailed>()
    })
})

export const tanQueries = mergeQueryKeys(activities);