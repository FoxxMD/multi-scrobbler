import { createQueryKeys, mergeQueryKeys } from "@lukemorales/query-key-factory";
import { useQueryClient, hashKey, QueryObserver } from '@tanstack/react-query'
import { useEffect, useState, useMemo } from 'react';
import ky, { type Options } from 'ky';
import qs from 'qs';
import { baseUrl } from "../utils";
import {type AlbumSearchResultResponse, type ArtistSearchResultResponse, type ComponentsApiJson, type PaginatedResponse, type PlayApiCommonDetailed, type QueryPlaysOptsJson, type TrackSearchResultResponse, type QueryPlaysOptsJsonRefreshable, type TrackDataCreditBase, type ArtistSearchSimpleRequestQuery, artistSearchSimpleRequestQuerySchema, trackDataCreditBaseSchema, type TrackSearchSimpleRequestQuery, trackSearchSimpleRequestQuerySchema, type AlbumSearchSimpleRequestQuery, albumSearchSimpleRequestQuerySchema } from "../../core/Api";
import { type SourcePlayerJson } from "../../core/Atomic";
import { queryPlayOptsRefreshableToJson } from "../utils/ComponentUtils";
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
  artists: (query: ArtistSearchSimpleRequestQuery | TrackDataCreditBase) => ({
    queryKey: ['metadata', 'artists', query],
    queryFn: (ctx) => {
      if (artistSearchSimpleRequestQuerySchema.validate(query)) {
        return ky.get(`metadata/search/artists`, {
          baseUrl,
          searchParams: query
        }).json<ArtistSearchResultResponse>()
      }
      if (trackDataCreditBaseSchema.validate(query)) {
        return ky.post(`metadata/search/artists`, {
          baseUrl,
          json: query
        }).json<ArtistSearchResultResponse>()
      }
      throw new Error('Could not validate input');

    }
  }),
  track: (query: TrackSearchSimpleRequestQuery | TrackDataCreditBase) => ({
    queryKey: ['metadata', 'tracks', query],
    queryFn: (ctx) => {
      if (trackSearchSimpleRequestQuerySchema.validate(query)) {
        return ky.get(`metadata/search/tracks`, {
          baseUrl,
          searchParams: qs.stringify(query)
        }).json<TrackSearchResultResponse>()
      }
      if (trackDataCreditBaseSchema.validate(query)) {
        return ky.post(`metadata/search/tracks`, {
          baseUrl,
          json: query
        }).json<TrackSearchResultResponse>()
      }
      throw new Error('Could not validate input');

    }
  }),
  album: (query: AlbumSearchSimpleRequestQuery | TrackDataCreditBase) => ({
    queryKey: ['metadata', 'albums', query],
    queryFn: (ctx) => {
      if (albumSearchSimpleRequestQuerySchema.validate(query)) {
        return ky.get(`metadata/search/albums`, {
          baseUrl,
          searchParams: qs.stringify(query)
        }).json<AlbumSearchResultResponse>()
      }
      if (trackDataCreditBaseSchema.validate(query)) {
        return ky.post(`metadata/search/albums`, {
          baseUrl,
          json: query
        }).json<AlbumSearchResultResponse>()
      }
      throw new Error('Could not validate input');

    }
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