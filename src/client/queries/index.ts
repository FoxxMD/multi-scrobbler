import { createQueryKeys, mergeQueryKeys } from "@lukemorales/query-key-factory";
import ky from 'ky';
import { QueryPlaysOpts, QueryPlaysOptsJson } from "../../backend/common/database/drizzle/repositories/PlayRepository";
import qs from 'qs';
import { baseUrl } from "../utils";
import { PaginatedResponse } from "../../backend/common/database/drizzle/repositories/BaseRepository";
import { ComponentsApiJson, PlayApiCommonDetailed } from "../../core/Api";
import { SourcePlayerJson } from "../../core/Atomic";

const components = createQueryKeys('components', {
    list: () => ({
        queryKey: ['components'],
        queryFn: (ctx) => {
            return ky.get(`components`, {
       baseUrl: baseUrl,
      }).json<ComponentsApiJson[]>()
    }
    }),
    single: (componentId: number) => ({
        queryKey: ['components', componentId],
        queryFn: (ctx) => ky.get(`components/${componentId}`, { baseUrl }).json<ComponentsApiJson>()
    })
})

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

const players = createQueryKeys('players', {
    list: (componentId: number) => ({
        queryKey: ['components', componentId, 'players'],
        queryFn: (ctx) => {
            return ky.get(`components/${componentId}/players`, {
       baseUrl: baseUrl,
      }).json<Record<string, SourcePlayerJson>>()
    }
    }),
    single: (componentId: number, platformId: string) => ({
        queryKey: ['components', componentId, 'play', platformId],
        queryFn: (ctx) => ky.get(`components/${componentId}/players/${platformId}`, { baseUrl }).json<SourcePlayerJson>()
    })
})

export const tanQueries = mergeQueryKeys(components, activities, players);