import { describe, it } from 'mocha';
import { expect } from 'chai';
import dayjs from 'dayjs';
import { loggerTest } from '@foxxmd/logging';
import { eq } from 'drizzle-orm';
import type { LifecycleStep, PlayObject } from '../../../core/Atomic.ts';
import { diffObjects, patchObject } from '../../../core/DataUtils.ts';
import { creditId, creditIds, creditMbid } from '../../../core/MusicMetadata.ts';
import { nameToCredit } from "../../../core/MusicMetadata.ts";
import { namesToCredits } from "../../../core/MusicMetadata.ts";
import { generateMbid } from '../../../core/tests/utils/PlayTestUtils.ts';
import { isLegacyData, legacyPlayToCredits, rebuildLifecycle, up } from '../../common/database/appMigrations/005_creditShape.ts';
import { components, playEvents, playsHistorical } from '../../common/database/drizzle/schema/schema.ts';
import { generatePlayHistoricalEntity } from '../../common/database/drizzle/entityUtils.ts';
import { DrizzlePlayRepository } from '../../common/database/drizzle/repositories/PlayRepository.ts';
import { playContentBasicInvariantTransform } from '../../utils/PlayComparisonUtils.ts';
import { hashObject } from '../../utils/StringUtils.ts';
import { fixtureCreateComponent, fixtureCreatePlay } from '../utils/databaseFixtures.ts';
import { transientDb } from '../utils/TransientTestUtils.ts';

const json = <T>(val: T): T => JSON.parse(JSON.stringify(val));

const legacyFixture = () => {
    const ids = {
        recording: generateMbid(),
        release: generateMbid(),
        releaseGroup: generateMbid(),
        artistA: generateMbid(),
        artistB: generateMbid(),
    };
    const playDate = dayjs().subtract(1, 'h');
    const inputPlay = {
        data: {
            track: 'Old Title',
            artists: [{ name: 'Artist A', mbid: ids.artistA }, { name: 'Artist B' }],
            albumArtists: [{ name: 'Artist A' }, { name: 'Someone Else' }],
            album: 'An Album',
            duration: 200,
            playDate,
            meta: {
                brainz: {
                    trackNumber: 3
                },
                spotify: {
                    track: 'spTrack'
                }
            }
        },
        meta: {
            source: 'Spotify',
            art: { album: 'https://example.com/input.jpg' }
        }
    };
    const finalData = {
        ...inputPlay.data,
        track: 'New Title',
        meta: {
            brainz: {
                trackNumber: 3,
                recording: ids.recording,
                album: ids.release,
                releaseGroup: ids.releaseGroup,
                artist: [ids.artistA, ids.artistB],
                // does not line up with album artists so should be dropped
                albumArtist: [ids.artistA]
            },
            spotify: {
                track: 'spTrack'
            }
        }
    };
    const lifecycle: LifecycleStep[] = [
        { hook: 'preCompare', stageType: 'native', stageName: 'noop', source: 'test', flowResult: 'continue', createdAt: dayjs().toISOString() },
        { hook: 'preCompare', stageType: 'musicbrainz', stageName: 'mb', source: 'test', flowResult: 'continue', createdAt: dayjs().toISOString(), patch: diffObjects(json(inputPlay.data), json(finalData)) }
    ];
    const finalPlay = {
        data: finalData,
        meta: {
            source: 'Spotify',
            art: { album: 'https://example.com/final.jpg' }
        },
        lifecycle,
        scrobble: {
            mergedScrobble: { data: finalData, meta: {} }
        }
    };
    return { ids, inputPlay, finalPlay };
}

const assertConvertedFinal = (play: PlayObject, ids: ReturnType<typeof legacyFixture>['ids']) => {
    const { track, album, artists, albumArtists, meta } = play.data;
    expect(isLegacyData(play.data as any)).is.false;
    expect(track!.name).eq('New Title');
    expect(creditMbid(track, 'recording')).eq(ids.recording);
    expect(creditId(track, 'spotify', 'track')).eq('spTrack');
    expect(album!.name).eq('An Album');
    expect(album!.image).eq('https://example.com/final.jpg');
    expect(creditMbid(album, 'release')).eq(ids.release);
    expect(creditMbid(album, 'release-group')).eq(ids.releaseGroup);
    expect(artists!.map(x => x.name)).eql(['Artist A', 'Artist B']);
    expect(creditIds(artists, 'musicbrainz', 'artist')).eql([ids.artistA, ids.artistB]);
    expect(albumArtists!.map(x => x.name)).eql(['Artist A', 'Someone Else']);
    expect(creditIds(albumArtists, 'musicbrainz', 'artist')).is.empty;
    expect(meta).eql({ brainz: { trackNumber: 3 } });
    expect((play.meta as any).art).is.undefined;
}

describe('#Credit shape migration', function () {

    it('converts legacy play data, art, and embedded plays', function () {
        const { ids, finalPlay } = legacyFixture();
        const converted = legacyPlayToCredits(finalPlay) as unknown as PlayObject;
        assertConvertedFinal(converted, ids);
        expect(converted.scrobble!.mergedScrobble!.data.track!.name).eq('New Title');
        expect(creditMbid(converted.scrobble!.mergedScrobble!.data.track, 'recording')).eq(ids.recording);
    });

    it('does not modify already converted plays', function () {
        const { finalPlay } = legacyFixture();
        const converted = legacyPlayToCredits(finalPlay);
        expect(hashObject(json(legacyPlayToCredits(converted)))).eq(hashObject(json(converted)));
    });

    it('sets album art on track when there is no album', function () {
        const converted = legacyPlayToCredits({ data: { track: 'A Track', artists: ['An Artist'] }, meta: { art: { album: 'https://example.com/a.jpg' } } }) as unknown as PlayObject;
        expect(converted.data.album).is.undefined;
        expect(converted.data.track!.image).eq('https://example.com/a.jpg');
        expect(converted.data.artists).eql([{ name: 'An Artist' }]);
    });

    it('rebuilds lifecycle patches so they apply to converted data', function () {
        const { inputPlay, finalPlay } = legacyFixture();
        const steps = rebuildLifecycle(finalPlay.lifecycle, inputPlay, finalPlay.meta.art);
        expect(steps).length(2);
        expect(steps[0].patch).is.undefined;
        expect(steps[1].patch).to.not.be.undefined;

        const convertedInput = json(legacyPlayToCredits(inputPlay).data);
        const convertedFinal = json(legacyPlayToCredits(finalPlay).data);
        expect(hashObject(patchObject(convertedInput, steps[1].patch!))).eq(hashObject(convertedFinal));
    });

    it('removes lifecycle patches that cannot be rebuilt', function () {
        const { finalPlay } = legacyFixture();
        const steps = rebuildLifecycle(finalPlay.lifecycle, undefined);
        expect(steps).length(2);
        expect(steps.every(x => x.patch === undefined)).is.true;
        expect(steps[1].stageName).eq('mb');
    });

    it('migrates stored plays, inputs, and historical plays', async function () {
        const db = await transientDb();
        const { ids, inputPlay, finalPlay } = legacyFixture();

        const [component] = await db.insert(components).values(fixtureCreateComponent()).returning();
        const repo = new DrizzlePlayRepository(db);
        await repo.createPlays([{
            ...fixtureCreatePlay({ play: finalPlay as unknown as PlayObject }),
            componentId: component.id,
            state: 'queued' as const,
            input: { data: { foo: 'bar' }, play: inputPlay as unknown as PlayObject }
        }]);
        const [created] = await repo.findPlays({});
        await db.insert(playEvents).values({ playId: created.id, eventName: 'scrobbleResult', data: finalPlay.scrobble });
        await db.insert(playsHistorical).values(generatePlayHistoricalEntity(finalPlay as unknown as PlayObject, { componentId: component.id }));

        const ctx = { db, logger: loggerTest };
        await up(db.$client, ctx);

        const expectedHash = hashObject(playContentBasicInvariantTransform({
            data: {
                track: nameToCredit('New Title'),
                artists: namesToCredits(['Artist A', 'Artist B']),
                albumArtists: namesToCredits(['Artist A', 'Someone Else']),
                album: nameToCredit('An Album'),
                duration: 200,
            },
            meta: {}
        }).data);

        const check = async () => {
            const [row] = await repo.findPlays({ with: ['input'] }) as any[];
            assertConvertedFinal(row.play, ids);
            expect(row.playHash).eq(expectedHash);
            expect(row.mbidIdentifier).eq(`${ids.recording}-${ids.release}`);

            const input = row.input.play as PlayObject;
            expect(input.data.track!.name).eq('Old Title');
            expect(input.data.album!.image).eq('https://example.com/input.jpg');
            expect(creditIds(input.data.artists, 'musicbrainz', 'artist')).eql([ids.artistA]);
            expect((input.meta as any).art).is.undefined;

            // lifecycle steps are stored as transform events, patches should replay from converted input to converted play
            const events = await db.select().from(playEvents).where(eq(playEvents.playId, row.id));
            const steps = events.filter(x => x.eventName === 'transform').flatMap(x => x.data as LifecycleStep[]);
            expect(steps).length(2);
            const patched = steps.reduce((acc: object, curr: LifecycleStep) => curr.patch !== undefined ? patchObject(acc, curr.patch) : acc, json(input.data));
            expect(hashObject(patched)).eq(hashObject(json(row.play.data)));

            const scrobbleEvent = events.find(x => x.eventName === 'scrobbleResult')!;
            expect((scrobbleEvent.data as any).mergedScrobble.data.track.name).eq('New Title');

            const [historical] = await db.select().from(playsHistorical);
            assertConvertedFinal(historical.play, ids);
            expect(historical.playHash).eq(expectedHash);
        }

        await check();
        // running again should not change anything
        await up(db.$client, ctx);
        await check();
    });
});
