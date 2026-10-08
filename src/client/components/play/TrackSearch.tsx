import { useListCollection, Stack, Text, HStack, Span, Badge, Box, Flex } from "@chakra-ui/react"
import { useDebouncedState } from '@tanstack/react-pacer'
import { useQuery } from '@tanstack/react-query';
import { tanQueries } from "../../queries/index.js";
import { type TrackSearchResult } from "../../../core/Api.js";
import React, { useCallback, useEffect, useState } from "react";
import { ArtistCreditTags } from "../ArtistCreditDisplay.js";
import { LeftSideMetadataResultContent, MetadataPickMenu, MetadataSearchCombobox, MetadataServiceScore, type MetadataPartials } from "./MetadataResults.js";
import { playTrackDataSchema, type Credit, type TrackData } from "../../../core/Atomic.js";
import { playImage } from "../../../core/MusicMetadata.js";
import { MusicServiceIndicators } from "../musicServices/MusicServiceIndicators.js";
import { timeToHumanTimestamp } from "../../../core/TimeUtils.js";
import { CountryFlag } from "../Country.js";
import dayjs from "dayjs";

const trackPartials: MetadataPartials<TrackSearchResult> = {
    track: { label: 'Track + duration only', pick: ({ artists, album, albumArtists, albumCount, ...rest }) => rest },
    artists: { label: 'Track + duration + artists', pick: ({ album, albumArtists, albumCount, ...rest }) => rest },
    album: { label: 'Track + duration + album', pick: ({ artists, ...rest }) => rest },
};

export const TrackSearchResultItem = (props: { data: TrackSearchResult, onPick?: (val: TrackSearchResult) => void }) => {

    const { onPick } = props;

    const {
        track,
        album,
        albumCount,
        duration,
        artists = []
    } = props.data;

    let albumContent: React.JSX.Element | undefined = undefined;
    if (album !== undefined) {
        const {
            albumType,
            albumTypeHint,
            country,
            date,
            name: albumName,
            metadata: albumMetadata
        } = album;

        const countryElm: React.JSX.Element | undefined = country !== undefined ? <CountryFlag iso={country} tooltip={(val) => `Released in ${val}`}/> : undefined;
        let locationDateInfo: React.JSX.Element | undefined = undefined;
        if(countryElm !== undefined && date === undefined) {
            locationDateInfo = countryElm;
        } else if(countryElm !== undefined && date !== undefined) {
            locationDateInfo = <Badge variant="outline">{countryElm}<Span>{dayjs(date).format('YYYY')}</Span></Badge>
        }
        const albumHints: string[] = [];
        if(albumType !== undefined) {
            albumHints.push(albumType);
        }
        if(albumTypeHint !== undefined) {
            albumHints.push(albumTypeHint);
        }
        const andCount = albumCount !== undefined && albumCount > 1 ? (
            <Text hideBelow="md" color="fg.subtle" textStyle="sm">
                and {albumCount} more albums...
            </Text>
        ) : undefined;
        albumContent = (<Text color="fg.muted" textStyle="sm">
            <Flex wrap="wrap" flexDirection="row" columnGap="2">
                {albumName} {albumHints.length > 0 ? `(${albumHints.join(' -- ')})` : ''}{locationDateInfo}<MusicServiceIndicators services={albumMetadata ?? []}/> {andCount}
            </Flex>
        </Text>)
    }

    let artistTags: React.JSX.Element | undefined = undefined;
    if (artists.length > 0) {
        artistTags = <ArtistCreditTags data={artists} />
    }

    const smallMetadataServiceScore = <Badge hideFrom="sm" variant="subtle" size="sm"><MetadataServiceScore {...props.data}/></Badge>

    return (
        <HStack gap="4" flexGrow="1">
            <Box hideBelow="sm"><LeftSideMetadataResultContent {...props.data} image={playImage(props.data)} /></Box>
            <Stack gap="1" flexGrow="1">
                    {smallMetadataServiceScore}
                    <Box display="flow-root">
                        {/* floated and first in DOM so the rest flows around it */}
                        <Box float="right" marginStart="2">
                            <MetadataPickMenu data={props.data} partials={trackPartials} onPick={onPick} />
                        </Box>
                        {track?.name}{' '}
                        {duration !== undefined ? <Span>({timeToHumanTimestamp(duration * 1000)}) </Span> : undefined}
                        <MusicServiceIndicators display="inline-flex" verticalAlign="middle" services={track?.metadata ?? []}/>
                    </Box>
                {artistTags}
                {albumContent}
            </Stack>
        </HStack>
    )
}

/** Play data to change when a track is selected. Artists and album are only included if the selected track has them. */
export type TrackOnChange = Pick<TrackData, 'track' | 'artists' | 'album' | 'albumArtists' | 'duration'>;

export interface TrackSearchProps {
    initial?: Credit
    onChange: (val: TrackOnChange) => void
}

const trackSearchResultToOnChange = (val: TrackOnChange): TrackOnChange => {
    // drops the search-only properties of a result and of the results nested in it
    const { meta, ...change } = playTrackDataSchema.parse(val);
    // an album always replaces album artists, even when it has none, so artists from a previous album are not kept
    return change.album !== undefined ? { ...change, albumArtists: change.albumArtists } : change;
}

export const TrackSearch = (props: TrackSearchProps) => {

    const {
        initial,
        onChange = (val) => console.log(val, 'Selected value for prop')
    } = props;

    const [selectedItem, setSelectedItem] = useState<Credit>(initial ?? {name: ''});
    const [debouncedQuery, setDebouncedQuery] = useDebouncedState<string>(initial?.name ?? '', { wait: 500 });

    const query = useQuery({
        enabled: debouncedQuery !== '',
        ...tanQueries.metadata.track(debouncedQuery)
    });

    const { collection, set } = useListCollection<TrackSearchResult>({
        initialItems: query.data?.data ?? [],
        itemToString: (item) => item.track?.name ?? '',
        itemToValue: (item) => item.id,
    });

    useEffect(() => {
        if (query.isSuccess) {
            set(query.data.data);
        }
    }, [query, set])

    const doChange = useCallback((val: TrackOnChange) => {
        const change = trackSearchResultToOnChange(val);
        setSelectedItem(change.track ?? {name: ''});
        onChange(change);
    },[setSelectedItem, onChange]);

    const services = selectedItem.metadata ?? [];
    let groupContent: React.JSX.Element | undefined = undefined;
    if(services.length > 0) {
        groupContent = <MusicServiceIndicators services={services} link={false}/>
    }

    return (
        <MetadataSearchCombobox
        defaultOpen
            placeholder="Type to search for tracks"
            collection={collection}
            inputGroupContent={groupContent}
            isLoading={query.isLoading}
            isError={query.isError}
            initialInput={selectedItem?.name}
            onChange={doChange}
            onFreetext={(name) => doChange({ track: { name } })}
            onQueryChange={setDebouncedQuery}
            renderItem={(item, onPick) => <TrackSearchResultItem data={item} onPick={onPick} />}
        />
    );
}