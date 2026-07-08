import { createQueryKeys, mergeQueryKeys } from "@lukemorales/query-key-factory";
import { useQueryClient, hashKey, QueryObserver } from '@tanstack/react-query'
import { useEffect, useState, useMemo } from 'react';
import ky from 'ky';
import { QueryPlaysOpts, QueryPlaysOptsJson } from "../../backend/common/database/drizzle/repositories/PlayRepository";
import qs from 'qs';
import { baseUrl } from "../utils";
import { PaginatedResponse } from "../../backend/common/database/drizzle/repositories/BaseRepository";
import { ComponentsApiJson, PlayApiCommonDetailed, PlayStateUI } from "../../core/Api";
import { CLIENT_DEAD_QUEUE, CLIENT_INGRESS_QUEUE, isPlayState, SourcePlayerJson } from "../../core/Atomic";

export type QueryPlaysOptsJsonRefreshable = Omit<QueryPlaysOptsJson, 'state'> & {nonce?: string, state?: PlayStateUI[]};

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
                state,
                ...rest
            } = filters;
            const derived: QueryPlaysOptsJson = rest;
            if(state !== undefined) {
              derived.state = state.filter(x => isPlayState(x));

              // remove 'dead queued' derived play state and replace with filter for queue = 'dead' & state = 'queued'
              if(state.includes('dead queued') && !rest.queues?.some(x => x.queueName === CLIENT_DEAD_QUEUE)) {
                derived.queues = [...(rest.queues ?? []), {queueName: CLIENT_DEAD_QUEUE, queueStatus: 'queued'}];
              }
              // remove 'queued' play state and replace with filter for queue = 'ingress' & state = 'queued'
              if(state.includes('queued') && !rest.queues?.some(x => x.queueName === CLIENT_INGRESS_QUEUE)) {
                derived.queues = [...(derived.queues ?? []), {queueName: CLIENT_INGRESS_QUEUE, queueStatus: 'queued'}];
                derived.state = derived.state.filter(x => x !== 'queued');
              }
          }
            return ky.get(`components/${componentId}/plays`, {
                baseUrl: baseUrl,
                searchParams: qs.stringify({...derived, offset: ctx.pageParam})
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
});

const logs = createQueryKeys('logs', {
  list: (level: string, limit: number) => ({
    queryKey: ['logs', {level, limit}],
    queryFn: (ctx) => {
      return ky.get(`logs`, { 
        baseUrl: baseUrl 
      }).json<{data: {line: string, time: number, levelLabel: string, level: number}[]}>();
    }
  })
})

export const tanQueries = mergeQueryKeys(components, activities, players, logs);

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