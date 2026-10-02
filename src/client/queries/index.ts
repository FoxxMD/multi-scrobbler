import { createQueryKeys, mergeQueryKeys } from "@lukemorales/query-key-factory";
import { useQueryClient, hashKey, QueryObserver } from '@tanstack/react-query'
import { useEffect, useState, useMemo } from 'react';
import ky from 'ky';
import qs from 'qs';
import { baseUrl } from "../utils";
import type {AlbumSearchResultResponse, ArtistSearchResultResponse, ComponentsApiJson, PaginatedResponse, PlayApiCommonDetailed, PlayStateUI, QueryPlaysOptsJson, TrackSearchResultResponse} from "../../core/Api";
import { type SourcePlayerJson } from "../../core/Atomic";
import { queryPlayOptsRefreshableToJson } from "../utils/ComponentUtils";

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
    }),
    authUrl: (componentId: number) => ({
      queryKey: ['components', componentId, 'auth'],
      queryFn: (ctx) => ky.get(`components/${componentId}/auth`, { baseUrl }).text()
    })
})

export const fetchPlaysPage = (componentId: number, filters: QueryPlaysOptsJsonRefreshable, offset?: number) => {
    const derived: QueryPlaysOptsJson = queryPlayOptsRefreshableToJson(filters)
    return ky.get(`components/${componentId}/plays`, {
        baseUrl: baseUrl,
        searchParams: qs.stringify({...derived, offset})
    }).json<PaginatedResponse<PlayApiCommonDetailed>>()
}

const activities = createQueryKeys('activities', {
    list: (componentId: number, filters: QueryPlaysOptsJsonRefreshable) => ({
        queryKey: ['components', componentId, 'plays', filters],
        queryFn: (ctx) => fetchPlaysPage(componentId, filters, typeof ctx.pageParam === "number" ? ctx.pageParam : undefined)
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

const metadata = createQueryKeys('metadata', {
  artists: (query: string) => ({
    queryKey: ['metadata', 'artists', query],
    queryFn: (ctx) => ky.get(`artists`, {
      baseUrl,
      searchParams: {
        q: query
      }
    }).json<ArtistSearchResultResponse>()
  }),
  track: (query: string) => ({
    queryKey: ['metadata', 'tracks', query],
    queryFn: (ctx) => ky.get(`tracks`, {
      baseUrl,
      searchParams: {
        q: query
      }
    }).json<TrackSearchResultResponse>()
  }),
  album: (query: string) => ({
    queryKey: ['metadata', 'albums', query],
    queryFn: (ctx) => ky.get(`albums`, {
      baseUrl,
      searchParams: {
        q: query
      }
    }).json<AlbumSearchResultResponse>()
  })
});

export const tanQueries = mergeQueryKeys(components, activities, players, logs, metadata);

export const useQueryState = (queryKey: Readonly<unknown[]>) => {
  const queryClient = useQueryClient()
  const [state, setState] = useState(() => queryClient.getQueryState(queryKey))
  // callers usually pass a freshly built key array each render so depend on its hash instead of its identity
  const targetHash = hashKey(queryKey)

  useEffect(() => {
    setState(queryClient.getQueryState(queryKey))
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryHash === targetHash) {
        setState(event.query.state)
      }
    })
  }, [queryClient, targetHash])

  return state // { status, data, error, fetchStatus, ... }
}

export const useQueryWatcher = <T>(queryKey: Readonly<unknown[]>) => {
  const queryClient = useQueryClient()
  // callers usually pass a freshly built key array each render so depend on its hash instead of its identity
  // otherwise a new observer is created (and re-subscribed) on every render
  const keyHash = hashKey(queryKey)

  const observer = useMemo(
    () =>
      new QueryObserver<T>(queryClient, {
        queryKey,
        enabled: false, // never triggers its own fetch
      }),
    [queryClient, keyHash]
  )

  const [result, setResult] = useState(() => observer.getCurrentResult())

  useEffect(() => {
    // sync result in case the observer changed (key changed) since initial state
    setResult(observer.getCurrentResult())
    return observer.subscribe(setResult)
  }, [observer])

  return result // { status, data, error, isPending, isSuccess, ... }
}