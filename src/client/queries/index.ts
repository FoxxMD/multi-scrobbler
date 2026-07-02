import { createQueryKeys, mergeQueryKeys } from "@lukemorales/query-key-factory";
import { useQueryClient, hashKey, QueryObserver } from '@tanstack/react-query'
import { useEffect, useState, useMemo } from 'react';
import ky from 'ky';
import { QueryPlaysOpts, QueryPlaysOptsJson } from "../../backend/common/database/drizzle/repositories/PlayRepository";
import qs from 'qs';
import { baseUrl } from "../utils";
import { PaginatedResponse } from "../../backend/common/database/drizzle/repositories/BaseRepository";
import { ComponentsApiJson, PlayApiCommonDetailed } from "../../core/Api";
import { SourcePlayerJson } from "../../core/Atomic";

export type QueryPlaysOptsJsonRefreshable = QueryPlaysOptsJson & {nonce?: string};

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
    list: (componentId: number, filters: QueryPlaysOptsJsonRefreshable) => ({
        queryKey: ['components', componentId, 'plays', filters],
        queryFn: (ctx) => {
            const {
                nonce,
                ...rest
            } = filters;
            return ky.get(`components/${componentId}/plays`, {
                baseUrl: baseUrl,
                searchParams: qs.stringify({...rest, offset: ctx.pageParam})
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

export const useQueryState = (queryKey: Readonly<unknown[]>) => {
  const queryClient = useQueryClient()
  const [state, setState] = useState(() => queryClient.getQueryState(queryKey))

  useEffect(() => {
    const targetHash = hashKey(queryKey)
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryHash === targetHash) {
        setState(event.query.state)
      }
    })
  }, [queryClient, queryKey])

  return state // { status, data, error, fetchStatus, ... }
}

export const useQueryWatcher = <T>(queryKey: Readonly<unknown[]>) => {
  const queryClient = useQueryClient()

  const observer = useMemo(
    () =>
      new QueryObserver<T>(queryClient, {
        queryKey,
        enabled: false, // never triggers its own fetch
      }),
    [queryClient, queryKey]
  )

  const [result, setResult] = useState(() => observer.getCurrentResult())

  useEffect(() => {
    return observer.subscribe(setResult)
  }, [observer])

  return result // { status, data, error, isPending, isSuccess, ... }
}