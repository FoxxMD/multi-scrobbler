import { createQueryKeys, mergeQueryKeys } from "@lukemorales/query-key-factory";
import { useQueryClient, hashKey, QueryObserver, experimental_streamedQuery as streamedQuery } from '@tanstack/react-query'
import { useEffect, useState, useMemo } from 'react';
import ky, { type Options } from 'ky';
import qs from 'qs';
import { baseUrl } from "../utils";
import {type AlbumSearchResult, type ArtistSearchResult, type TrackSearchResult, type MetadataSearchStreamLine, type MetadataSearchError, type MetadataResultServiceScore, NDJSON_MEDIA_TYPE, type ComponentsApiJson, type PaginatedResponse, type PlayApiCommonDetailed, type QueryPlaysOptsJson, type QueryPlaysOptsJsonRefreshable, type TrackDataCreditBase, type ArtistSearchSimpleRequestQuery, artistSearchSimpleRequestQuerySchema, trackDataCreditBaseSchema, type TrackSearchSimpleRequestQuery, trackSearchSimpleRequestQuerySchema, type AlbumSearchSimpleRequestQuery, albumSearchSimpleRequestQuerySchema } from "../../core/Api";
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

/** Reads a streamed metadata search response one line at a time. Throws if the stream ends before the server says it is done. */
async function* searchStreamLines<T>(response: Response): AsyncGenerator<MetadataSearchStreamLine<T>> {
  // read with a reader: not every browser can iterate a ReadableStream directly
  if (response.body === null) {
    throw new Error('Search response has no body');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // the last piece is an incomplete line until more data arrives
    buffer = lines.pop() ?? '';
    for (const text of lines) {
      if (text.trim() === '') {
        continue;
      }
      const line = JSON.parse(text) as MetadataSearchStreamLine<T>;
      if (line.type === 'done') {
        return;
      }
      yield line;
    }
  }
  throw new Error('Search results ended before all providers responded');
}

type MetadataSearchData<T> = { data: T[], errors: MetadataSearchError[] };

/** Results are added to query data, sorted by score, as each provider responds instead of after all of them have */
const metadataSearchQueryFn = <T extends MetadataResultServiceScore>(path: string, simpleSchema: { validate: (val: unknown) => boolean }, query: object) => streamedQuery<MetadataSearchStreamLine<T>, MetadataSearchData<T>>({
  streamFn: async (ctx) => {
    const opts: Options = { baseUrl, signal: ctx.signal, headers: { Accept: NDJSON_MEDIA_TYPE } };
    if (simpleSchema.validate(query)) {
      return searchStreamLines<T>(await ky.get(path, { ...opts, searchParams: qs.stringify(query) }));
    }
    if (trackDataCreditBaseSchema.validate(query)) {
      return searchStreamLines<T>(await ky.post(path, { ...opts, json: query }));
    }
    throw new Error('Could not validate input');
  },
  // a background refetch swaps in the new results when it finishes instead of emptying a list the user may have open
  refetchMode: 'replace',
  initialValue: { data: [], errors: [] },
  reducer: (acc, line) => {
    if (line.type === 'result') {
      return { ...acc, data: acc.data.concat(line.data).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)) };
    }
    if (line.type === 'error') {
      return { ...acc, errors: acc.errors.concat({ service: line.service, error: line.error }) };
    }
    return acc;
  }
});

const metadata = createQueryKeys('metadata', {
  artists: (query: ArtistSearchSimpleRequestQuery | TrackDataCreditBase) => ({
    queryKey: ['metadata', 'artists', query],
    queryFn: metadataSearchQueryFn<ArtistSearchResult>(`metadata/search/artists`, artistSearchSimpleRequestQuerySchema, query)
  }),
  track: (query: TrackSearchSimpleRequestQuery | TrackDataCreditBase) => ({
    queryKey: ['metadata', 'tracks', query],
    queryFn: metadataSearchQueryFn<TrackSearchResult>(`metadata/search/tracks`, trackSearchSimpleRequestQuerySchema, query)
  }),
  album: (query: AlbumSearchSimpleRequestQuery | TrackDataCreditBase) => ({
    queryKey: ['metadata', 'albums', query],
    queryFn: metadataSearchQueryFn<AlbumSearchResult>(`metadata/search/albums`, albumSearchSimpleRequestQuerySchema, query)
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