import { loggerTest, childLogger } from "@foxxmd/logging";
import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { describe, it } from 'mocha';
import AbstractComponent, { type AbstractComponentConfig } from "../../common/AbstractComponent.ts";

import { DEFAULT_TRANSFORMER_NAME, type SearchReplaceTerm, type MetadataProviderStageType, TRANSFORM_HOOK, type TransformerCommon, type TransformerCommonConfig, whenSchema } from "../../../core/Transform.ts";

import { generateArtistsStr, generatePlay } from "../../../core/tests/utils/PlayTestUtils.ts";
import type {WebhookPayload} from "../../common/infrastructure/config/health/webhooks.ts";
import NativeTransformer from "../../common/transforms/NativeTransformer.ts";
import { initMemoryCache } from "../../common/Cache.ts";
import { Cacheable } from "cacheable";
import type {LifecycleStep, PlayMatchResult, PlayObject, QueueContext} from "../../../core/Atomic.ts";
import TransformerManager from "../../common/transforms/TransformerManager.ts";
import type AbstractTransformer from "../../common/transforms/AbstractTransformer.ts";
import { transientCache } from "../utils/TransientTestUtils.ts";
import dayjs from "dayjs";
import clone from "clone";
import { nameToCredit, creditsToNames, namesToCredits, mbMeta, creditMbid } from "../../../core/MusicMetadata.ts";
import UserTransformer, { type UserStage } from "../../common/transforms/UserTransformer.ts";
import MusicbrainzTransformer from "../../common/transforms/MusicbrainzTransformer.ts";
import SpotifyTransformer from "../../common/transforms/SpotifyTransformer.ts";
import RockskyTransformer from "../../common/transforms/rocksky/RockskyTransformer.ts";
import CoverArtArchiveTransformer from "../../common/transforms/coverartarchive/CoverArtArchiveTransformer.ts";
import { parseDurationComparison } from "../../../core/TimeUtils.ts";
import MatchTransformer from "../../common/transforms/match/MatchTransformer.ts";
import { getActionFromLifecycleSteps, testPlayParts, testWhenConditions } from "../../utils/PlayTransformUtils.ts";
import { SkipTransformStageError, TransformRulesError } from "../../common/errors/MSErrors.ts";
import { COMPONENT_STATE, type ComponentState, type TrackSearchResult } from "../../../core/Api.ts";
import type { PlayWith, PlaySelectWithQueueStates } from "../../common/database/drizzle/drizzleTypes.ts";
import type { PlayProcessingResult } from "../../common/infrastructure/PlayProcessing.ts";

chai.use(asPromised);

class TestTransformerManager extends TransformerManager {
    public hanging: string[] = [];
    public setPreferredProviders(preferred: TransformerManager['transformMetadataPreferredProviders']) {
        this.transformMetadataPreferredProviders = preferred;
    }
    public getProviders() {
        return this.transformMetadataProviders;
    }
    public initProviders() {
        return this.initMetadataProviders();
    }
    protected async initTransformer(transformer: AbstractTransformer): Promise<AbstractTransformer> {
        if(this.hanging.includes(transformer.name)) {
            return new Promise(() => {});
        }
        return super.initTransformer(transformer);
    }
}

const componentId = () => `test-${Date.now()}`; 
class TestComponent extends AbstractComponent {
    existingPlay(playObjPre: PlayObject, existingScrobbles: PlayObject[], log?: boolean): Promise<PlayMatchResult> {
        throw new Error("Method not implemented.");
    }
    findPreQueueExistingPlay(queueablePlay: PlayObject, context?: QueueContext & { isRetry?: boolean; }): Promise<PlayWith<"parent" | "queueStates">> {
        throw new Error("Method not implemented.");
    }
    processPlay(playEntity: PlaySelectWithQueueStates, signal?: AbortSignal): Promise<PlayProcessingResult> {
        throw new Error("Method not implemented.");
    }
    public getRunningState(): ComponentState {
       return COMPONENT_STATE.RUNNING;
    }
    public notify(payload: WebhookPayload): Promise<void> {
        throw new Error("Method not implemented.");
    }
    protected getIdentifier(): string {
        return 'test';
    }
    public async start(opts?: { forceInit?: boolean; }): Promise<boolean> {
        return true;
    }
    public async stop(opts?: { reason?: string | Error; }): Promise<void> {
        return;
    }
    constructor(config?: Omit<AbstractComponentConfig, 'id'>) {
        super({id: `test-${Date.now()}`, ...(config ?? {})});
    }
}

const createTestComponent = (config?: Omit<AbstractComponentConfig, 'id'>): TestComponent => {
    const component = new TestComponent(config);
    component.logger = childLogger(loggerTest, 'App');
    return component;
}

const component = new TestComponent();
component.logger = childLogger(loggerTest, 'App');

const memorycache = () => new Cacheable({primary: initMemoryCache()})

describe('Play Transforms', function () {

    beforeEach(function () {
        component.config = {
            id: componentId()
        };
        component.transformRules = {};
    });
    describe('Transform Config Parsing', function () {

        it('Sets transform rules as empty object if config is not present', async function () {
            await component.buildTransformRules();
            expect(component.transformRules).exist;
            expect(Object.keys(component.transformRules).length).eq(0);
        });

        it('Converts single object hook into hook array', async function () {
            component.config = {
                id: componentId(),
                options: {
                    playTransform: {
                        preCompare: {
                            type: "user",
                            title: ['something']
                        }
                    }
                }
            }

            await component.buildTransformRules();

            expect(component.transformRules.preCompare).to.be.an('array');
            expect(component.transformRules.preCompare).to.be.length(1);
            expect(component.transformRules.preCompare).to.have.nested.property('0.title');
        });

        describe('Stage Parsing', function () {

            it(`Throws an error if stage is an unexpected value`, async function () {
                component.config = {
                    options: {
                        playTransform: {
                            // @ts-expect-error no type named test, stage is untyped
                            preCompare: {
                                type: "test",
                                title: ['something']
                            }
                        }
                    }
                }

                await expect(component.buildTransformRules()).to.be.rejectedWith(TransformRulesError);
            });

        });

        describe('User Stage Parsing', function () {

            it(`Allows user 'type'`, async function () {
                component.config = {
                    id: componentId(),
                    options: {
                        playTransform: {
                            preCompare: {
                                type: "user",
                                title: ['something']
                            }
                        }
                    }
                }

                await component.buildTransformRules();

                expect(component.transformRules.preCompare).to.be.an('array');
                expect(component.transformRules.preCompare).to.be.length(1);
                expect(component.transformRules.preCompare).to.have.nested.property('0.type');
                expect(component.transformRules.preCompare![0].type).eq('user');
            });

            it('Accepts hook array', async function () {
                component.config = {
                    id: componentId(),
                    options: {
                        playTransform: {
                            preCompare: [
                                {
                                    type: 'user',
                                    title: ['something']
                                },
                                {
                                    type: 'user',
                                    title: ['something else']
                                }
                            ]
                        }
                    }
                }

                await component.buildTransformRules();

                expect(component.transformRules.preCompare).to.be.an('array');
                expect(component.transformRules.preCompare).to.be.length(2);
                expect(component.transformRules.preCompare).to.have.nested.property('0.title');
                expect(component.transformRules.preCompare).to.have.nested.property('1.title')
            });

            it('Converts transform config into real S&P data', async function () {
                component.config = {
                    id: componentId(),
                    options: {
                        playTransform: {
                            preCompare: {
                                type: 'user',
                                title: ['something']
                            }
                        }
                    }
                }

                await component.buildTransformRules();

                expect(component.transformRules.preCompare![0]).to.exist;
                expect((component.transformRules.preCompare![0] as UserStage).title).to.exist;
                expect(Array.isArray((component.transformRules.preCompare![0] as UserStage).title)).is.true;
                expect(((component.transformRules.preCompare![0] as UserStage).title as any[])[0]).to.include.keys('search', 'replace')
            });

            it('Converts transform config into real S&P data with default being empty string', async function () {
                component.config = {
                    id: componentId(),
                    options: {
                        playTransform: {
                            preCompare: {
                                type: 'user',
                                title: ['something']
                            }
                        }
                    }
                }

                await component.buildTransformRules();

                expect(component.transformRules.preCompare![0]).to.exist;
                expect((component.transformRules.preCompare![0] as UserStage).title).to.exist;
                expect(Array.isArray((component.transformRules.preCompare![0] as UserStage).title)).is.true;
                expect(((component.transformRules.preCompare![0] as UserStage).title as any[])[0]).to.include.keys('search', 'replace')
                const title = ((component.transformRules.preCompare![0] as UserStage).title as any[])[0] as SearchReplaceTerm;
                expect(title.search).is.eq('something');
                expect(title.replace).is.eq('');
            });

            it('Respects transform config when it is already S&P data', async function () {
                component.config = {
                    id: componentId(),
                    options: {
                        playTransform: {
                            preCompare: {
                                type: 'user',
                                title: [
                                    {

                                        search: 'nothing',
                                        replace: 'anything'
                                    }
                                ]
                            }
                        }
                    }
                }

                await component.buildTransformRules();

                expect(component.transformRules.preCompare![0]).to.exist;
                expect((component.transformRules.preCompare![0] as UserStage).title).to.exist;
                expect(Array.isArray((component.transformRules.preCompare![0] as UserStage).title)).is.true;
                expect(((component.transformRules.preCompare![0] as UserStage).title as any[])[0]).to.include.keys('search', 'replace')
                const title = ((component.transformRules.preCompare![0] as UserStage).title as any[])[0] as SearchReplaceTerm;
                expect(title.search).is.eq('nothing');
                expect(title.replace).is.eq('anything');
            });
        });

        describe('Non-User Stage Parsing', function () {

            describe('Non-User Stage Types', function () {

                for(const t of ['native'] as const) {

                    it(`Allows non-user Stage Type ${t}`, async function () {
                        component.config = {
                            id: componentId(),
                            options: {
                                playTransform: {
                                    preCompare: {
                                        type: t,
                                        title: true
                                    }
                                }
                            }
                        }

                        await component.buildTransformRules();
                        //expect(component.buildTransformRules()).to.eventually.not.throw();
                        expect(component.transformRules.preCompare).to.be.an('array');
                        expect(component.transformRules.preCompare).to.be.length(1);
                        expect(component.transformRules.preCompare).to.have.nested.property('0.type');
                        expect(component.transformRules.preCompare![0].type).eq(t);
                    });

                }

            });

        });

        describe('Play Transforming', function () {

            it('Returns original play if no hooks are defined', async function () {
                await component.buildTransformRules();

                const play = generatePlay();
                const {play: transformed} = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                expect(JSON.stringify(play)).equal(JSON.stringify(transformed));
            });

            describe('User Play Transforming', function () {
                it('Transforms when hook is present', async function () {
                    component.config = {
                        id: componentId(),
                        options: {
                            playTransform: {
                                preCompare: {
                                    type: 'user',
                                    title: ['something']
                                }
                            }
                        }
                    }
                    await component.buildTransformRules();

                    const play = generatePlay({ track: nameToCredit('My coolsomething track') });
                    const {play: transformed} = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                    expect(transformed.data.track?.name).equal('My cool track');
                });

                it('Transforms consecutively when hook is present with multiple values', async function () {
                    component.config = {
                        id: componentId(),
                        options: {
                            playTransform: {
                                preCompare: {
                                    type: 'user',
                                    title: ['something', 'cool']
                                }
                            }
                        }
                    }
                    await component.buildTransformRules();

                    const play = generatePlay({ track: nameToCredit('My coolsomething track') });
                    const {play: transformed} = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                    expect(transformed.data.track?.name).equal('My  track');
                });

                it('Transforms using parsed regex', async function () {
                    component.config = {
                        id: componentId(),
                        options: {
                            playTransform: {
                                preCompare: {
                                    type: 'user',
                                    title: [
                                        {
                                            search: '/(cool )(some)(thing)/i',
                                            replace: '$1$3'
                                        }
                                    ]
                                }
                            }
                        }
                    }
                    await component.buildTransformRules();

                    const play = generatePlay({ track: nameToCredit('My cool something track') });
                    const {play: transformed} = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                    expect(transformed.data.track?.name).equal('My cool thing track');
                });


                it('Transforms using parsed regex to get primary artist from delimited artist string', async function () {
                    component.config = {
                        id: componentId(),
                        options: {
                            playTransform: {
                                preCompare: {
                                    type: 'user',
                                    artists: [
                                        {
                                            search: '/(.*?)(\\s*\\/\\s*)(.*$)/i',
                                            replace: '$1'
                                        }
                                    ]
                                }
                            }
                        }
                    }
                    await component.buildTransformRules();

                    const play = generatePlay({ artists: namesToCredits(['My Artist One / My Artist Two / Another Guy']) });
                    const {play: transformed} = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                    expect(transformed.data.artists).length(1)
                    expect(transformed.data.artists![0].name).equal('My Artist One');
                });

                it('Removes title when transform replaces with empty string', async function () {
                    component.config = {
                        id: componentId(),
                        options: {
                            playTransform: {
                                preCompare: {
                                    type: 'user',
                                    title: ['something']
                                }
                            }
                        }
                    }
                    await component.buildTransformRules();

                    const play = generatePlay({ track: nameToCredit('something') });
                    const {play: transformed} = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                    expect(transformed.data.track).is.undefined;
                });

                it('Removes album when transform replaces with empty string', async function () {
                    component.config = {
                        id: componentId(),
                        options: {
                            playTransform: {
                                preCompare: {
                                    type: 'user',
                                    album: ['something']
                                }
                            }
                        }
                    }
                    await component.buildTransformRules();

                    const play = generatePlay({ album: nameToCredit('something') });
                    const {play: transformed} = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                    expect(transformed.data.album).is.undefined;
                });

                it('Removes an artist when transform replaces with empty string', async function () {
                    component.config = {
                        id: componentId(),
                        options: {
                            playTransform: {
                                preCompare: {
                                    type: 'user',
                                    artists: ['something']
                                }
                            }
                        }
                    }
                    await component.buildTransformRules();

                    const play = generatePlay({ artists: namesToCredits(['something', 'big']) });
                    const {play: transformed} = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                    expect(transformed.data.artists!.length).is.eq(1)
                    expect(transformed.data.artists![0].name).is.eq('big')
                });

            });

        });
    });

    describe('Native Transformer', function () {

        it('Uses artist parsing functions', async function() {

            const t = new NativeTransformer({name: 'test', type: 'native'}, {logger: loggerTest, cache: memorycache()});
            await t.initialize();

            const [str, primaries, secondaries] = generateArtistsStr({primary: {max: 3, ambiguousJoinedNames: true, trailingAmpersand: true, finalJoiner: false}});
            const play = generatePlay({artists: namesToCredits([str])});

            const transformedPlay = await t.handle(t.parseConfig({type: 'native'}), play);
            expect(creditsToNames(transformedPlay.data.artists!)).eql(primaries.concat(secondaries));
        });

        it('Ignores artists', async function() {

            const [str, primaries, secondaries] = generateArtistsStr({primary: {num: 2, ambiguousJoinedNames: false, trailingAmpersand: false, finalJoiner: false}, secondary: 0});

            const t = new NativeTransformer({name: 'test', type: 'native', defaults: {artistsIgnore: [str]}}, {logger: loggerTest, cache: memorycache()});

            await t.initialize();

            const play = generatePlay({artists: namesToCredits([str]), track: nameToCredit('My Test')});

            const transformedPlay = await t.handle(t.parseConfig({type: 'native'}), play);
            expect(creditsToNames(transformedPlay.data.artists!)).eql([str]);
        });

        it('Uses custom delimiters artists', async function() {

            const [str, primaries, secondaries] = generateArtistsStr({primary: {
                max: 3, 
                joiner: '•',
                spacedJoiners: true,
                ambiguousJoinedNames: false, 
                trailingAmpersand: false, 
                finalJoiner: false
            }});

            const t = new NativeTransformer({name: 'test', type: 'native', defaults: {delimitersExtra: ['•']}}, {logger: loggerTest, cache: memorycache()});

            await t.initialize();

            const play = generatePlay({artists: namesToCredits([str]), track: nameToCredit('My Test')});

            const transformedPlay = await t.handle(t.parseConfig({type: 'native'}), play);
            expect(creditsToNames(transformedPlay.data.artists!)).eql(primaries.concat(secondaries));
        });

    });

    describe('Conditional Transforming', function () {

        describe('On Hook', function () {
            it('Does not run hook if when conditions do not match', async function () {
                component.config = {
                    id: componentId(),
                    options: {
                        playTransform: {
                            preCompare: {
                                type: 'user',
                                when: [
                                    {
                                        album: "Has This"
                                    }
                                ],
                                artists: ['something']
                            }
                        }
                    }
                }
                await component.buildTransformRules();

                const play = generatePlay({ artists: namesToCredits(['something', 'big']), album: nameToCredit('It Has No Match') });
                const {play: transformed} = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                expect(transformed.data.artists!.length).is.eq(2)
                expect(transformed.data.artists![0].name).is.eq('something')
            });

            it('Does run hook if when conditions matches', async function () {
                component.config = {
                    id: componentId(),
                    options: {
                        playTransform: {
                            preCompare: {
                                type: 'user',
                                when: [
                                    {
                                        album: "Has This"
                                    }
                                ],
                                artists: ['something']
                            }
                        }
                    }
                }
                await component.buildTransformRules();

                const play = generatePlay({ artists: namesToCredits(['something', 'big']), album: nameToCredit('It Has This Match') });
                const {play: transformed} = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                expect(transformed.data.artists!.length).is.eq(1)
                expect(transformed.data.artists![0].name).is.eq('big')
            });
        });

        describe('On Search-And-Replace', function () {
            it('Does not run hook if when conditions do not match', async function () {
                component.config = {
                    id: componentId(),
                    options: {
                        playTransform: {
                            preCompare: {
                                type: 'user',
                                artists: [
                                    {
                                        search: "something",
                                        replace: "",
                                        when: [
                                            {
                                                album: "Has This"
                                            }
                                        ]
                                    }
                                ]
                            }
                        }
                    }
                }
                await component.buildTransformRules();

                const play = generatePlay({ artists: namesToCredits(['something', 'big']), album: nameToCredit('It Has No Match') });
                const {play: transformed} = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                expect(transformed.data.artists!.length).is.eq(2)
                expect(transformed.data.artists![0].name).is.eq('something')
            });

            it('Does run hook if when conditions matches', async function () {
                component.config = {
                    id: componentId(),
                    options: {
                        playTransform: {
                            preCompare: {
                                type: 'user',
                                artists: [
                                    {
                                        search: "something",
                                        replace: "",
                                        when: [
                                            {
                                                album: "Has This"
                                            }
                                        ]
                                    }
                                ]
                            }
                        }
                    }
                }
                await component.buildTransformRules();

                const play = generatePlay({ artists: namesToCredits(['something', 'big']), album: nameToCredit('It Has This Match') });
                const {play: transformed} = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                expect(transformed.data.artists!.length).is.eq(1)
                expect(transformed.data.artists![0].name).is.eq('big')
            });
        });

    });

    describe('Multiple hook transforms', function () {

        it('Accumulates transforms within a single stage', async function () {
            component.config = {
                id: componentId(),
                options: {
                    playTransform: {
                        preCompare: [
                            {
                                type: 'user',
                                title: [
                                    {
                                        search: "something",
                                        replace: "another else"
                                    }
                                ]
                            },
                            {
                                type: 'user',
                                title: [
                                    {
                                        search: "another else",
                                        replace: "final thing"
                                    }
                                ]
                            }
                        ]
                    }
                }
            }

            await component.buildTransformRules();
            const play = generatePlay({ track: nameToCredit('My cool something track') });
            const {play: transformed} = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
            expect(transformed.data.track?.name).equal('My cool final thing track');
        });

        it('Accumulates transforms across multiple stages', async function () {
            component.config = {
                id: componentId(),
                options: {
                    playTransform: {
                        preCompare: [
                            {
                                type: 'user',
                                title: [
                                    {
                                        search: "something",
                                        replace: "bar"
                                    }
                                ]
                            },
                            {
                                type: 'native'
                            }
                        ]
                    }
                }
            }

            const [str, primaries, secondaries] = generateArtistsStr({primary: {max: 3, ambiguousJoinedNames: true, trailingAmpersand: true, finalJoiner: false}});

            await component.buildTransformRules();
            const play = generatePlay({ track: nameToCredit('My cool something track'), artists: namesToCredits([str]) });
            const {play: transformed} = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
            expect(transformed.data.track?.name).equal('My cool bar track');
            expect(creditsToNames(transformed.data.artists!)).eql(primaries.concat(secondaries));
        });

    });

    describe("Stage Caching", function () {

        it('Re-uses steps without modifying other Play properties', async function () {
            component.config = {
                id: componentId(),
                options: {
                    playTransform: {
                        preCompare: [
                            {
                                type: 'user',
                                //name: "barChange",
                                title: [
                                    {
                                        search: "something",
                                        replace: "bar"
                                    }
                                ]
                            },
                            {
                                type: 'native'
                            }
                        ]
                    }
                }
            }

            const [str, primaries, secondaries] = generateArtistsStr({primary: {max: 3, ambiguousJoinedNames: true, trailingAmpersand: true, finalJoiner: false}});

            await component.buildTransformRules();
            const play = generatePlay({ track: nameToCredit('My cool something track'), artists: namesToCredits([str]), playDate: dayjs().subtract(10, 'm') });
            const {play: transformed} = await component.transformPlay(play, TRANSFORM_HOOK.preCompare, {log: 'all'});
            expect(transformed.data.track?.name).equal('My cool bar track');
            expect(creditsToNames(transformed.data.artists!)).eql(primaries.concat(secondaries));

            const cachablePlay = clone(play);
            const laterDate = dayjs().subtract(5, 'm');
            cachablePlay.data.playDate = laterDate;
            const {play: cacheTransformed} = await component.transformPlay(cachablePlay, TRANSFORM_HOOK.preCompare, {log: 'all'});
            expect(cacheTransformed.data.track?.name).equal('My cool bar track');
            expect(creditsToNames(cacheTransformed.data.artists!)).eql(primaries.concat(secondaries));
            expect(cacheTransformed.data.playDate!.isSame(cachablePlay.data.playDate));
        });

        it('Skips again when a skipped stage is cached', async function () {
            const t = new NativeTransformer({name: 'test', type: 'native'}, {logger: loggerTest, cache: memorycache()});
            await t.initialize();
            const stage = t.parseConfig({type: 'native', when: [{title: 'will not match'}]});
            const play = generatePlay({track: nameToCredit('My Test')});

            await expect(t.handle(stage, play)).to.be.rejectedWith(SkipTransformStageError);
            await expect(t.handle(stage, play)).to.be.rejectedWith(SkipTransformStageError);
        });

    });

    describe('Stage Defaults', function () {

        const opts = () => ({logger: loggerTest, cache: memorycache()});

        it('Musicbrainz uses transformer defaults over built-in defaults', function () {
            const t = new MusicbrainzTransformer({name: 'test', type: 'musicbrainz', defaults: {score: 50, searchWhenMissing: ['title'], releaseGroupSecondaryTypeDeny: []}}, opts());
            const stage = t.parseConfig({type: 'musicbrainz'});
            expect(stage.score).eq(50);
            expect(stage.searchWhenMissing).eql(['title']);
            expect(stage.releaseGroupSecondaryTypeDeny).eql([]);
        });

        it('Stage options override transformer defaults', function () {
            const t = new MusicbrainzTransformer({name: 'test', type: 'musicbrainz', defaults: {score: 50}}, opts());
            expect(t.parseConfig({type: 'musicbrainz', score: 70}).score).eq(70);
        });

        it('Spotify uses transformer defaults over built-in defaults', function () {
            const t = new SpotifyTransformer({name: 'test', type: 'spotify', defaults: {score: 0.9, searchWhenMissing: ['isrc']}}, opts());
            const stage = t.parseConfig({type: 'spotify'});
            expect(stage.score).eq(0.9);
            expect(stage.searchWhenMissing).eql(['isrc']);
        });

        it('Rocksky uses transformer defaults and stage searchWhenMissing', function () {
            const t = new RockskyTransformer({name: 'test', type: 'rocksky', defaults: {score: 50, searchWhenMissing: ['album']}}, opts());
            const stage = t.parseConfig({type: 'rocksky'});
            expect(stage.score).eq(50);
            expect(stage.searchWhenMissing).eql(['album']);
            expect(t.parseConfig({type: 'rocksky', searchWhenMissing: ['isrc']}).searchWhenMissing).eql(['isrc']);
        });

        it('Cover Art Archive uses transformer defaults over built-in defaults', function () {
            const t = new CoverArtArchiveTransformer({name: 'test', type: 'coverartarchive', defaults: {searchWhenMissing: ['album'], allowedTypes: ['back'], forceSearch: true}}, opts());
            const stage = t.parseConfig({type: 'coverartarchive'});
            expect(stage.searchWhenMissing).eql(['album']);
            expect(stage.allowedTypes).eql(['back']);
            expect(stage.forceSearch).is.true;
        });
    });

    describe('Stage Actions', function () {

        const step = (actionResult?: LifecycleStep['actionResult']): LifecycleStep => ({stageName: 'test', stageType: 'user', hook: 'preCompare', source: 'test', createdAt: 'same', actionResult});

        it('Last step with an action wins, even with identical createdAt', function () {
            expect(getActionFromLifecycleSteps([step('discard'), step(), step('review'), step()])).eq('review');
            expect(getActionFromLifecycleSteps([step('discard'), step('approve')])).eq('approve');
            expect(getActionFromLifecycleSteps([step(), step()])).is.undefined;
        });

        it('Sets step actionResult from the action term matching the stage outcome', async function () {
            component.config = {
                id: componentId(),
                options: {
                    playTransform: {
                        preCompare: [
                            {type: 'user', title: ['something'], onSuccessAction: 'discard', onSkipAction: 'review'},
                            {type: 'user', title: ['nothing'], when: {title: 'will not match'}, onSuccessAction: 'discard', onSkipAction: 'review'},
                            {type: 'user', title: ['cool'], onSuccessAction: 'approve', onSkipAction: 'review'},
                        ]
                    }
                }
            }
            await component.buildTransformRules();

            const {steps} = await component.transformPlay(generatePlay({ track: nameToCredit('My coolsomething track') }), TRANSFORM_HOOK.preCompare, {useCachedResult: false});
            expect(steps.map(x => x.actionResult)).eql(['discard', 'review', 'approve']);
            // a later approve negates earlier actions
            expect(getActionFromLifecycleSteps(steps)).eq('approve');
        });
    });

    describe('When Conditions', function () {

        it('Tests album artists', function () {
            const play = generatePlay({albumArtists: [nameToCredit('Various Artists')]});
            expect(testWhenConditions(whenSchema.parse({albumArtists: 'Various'}), play)).is.true;
            expect(testWhenConditions(whenSchema.parse({albumArtists: 'Nope'}), play)).is.false;
        });

        it('Accepts artist and albumArtist as aliases', function () {
            expect(whenSchema.parse({artist: 'foo', albumArtist: 'bar'})).eql([{artists: 'foo', albumArtists: 'bar'}]);
            expect(whenSchema.parse({artist: 'foo', artists: 'bar'})).eql([{artists: 'bar'}]);
        });

        it('Applies artist alias', function () {
            const play = generatePlay({artists: [nameToCredit('Elephant Gym')]});
            expect(testWhenConditions(whenSchema.parse({artist: 'Nope'}), play)).is.false;
        });

        it('Empty test matches missing part', function () {
            const play = generatePlay({artists: [nameToCredit('Elephant Gym')]});
            expect(testWhenConditions(whenSchema.parse({artists: ''}), play)).is.false;
            expect(testWhenConditions(whenSchema.parse({albumArtists: ''}), {...play, data: {...play.data, albumArtists: []}})).is.true;
        });

        it('Tests parts after art', function () {
            const play = generatePlay({artists: [nameToCredit('Elephant Gym')]});
            const noArt = {...play, data: {...play.data, art: undefined, album: undefined}, meta: {...play.meta, deviceId: 'abc'}};
            expect(testWhenConditions(whenSchema.parse({art: '', deviceId: 'nope'}), noArt)).is.false;
            expect(testWhenConditions(whenSchema.parse({art: '', deviceId: 'abc'}), noArt)).is.true;
        });

        it('Tests duration with built-in tester', function () {
            const play = generatePlay({duration: 120});
            expect(testPlayParts({duration: parseDurationComparison('> 7s')}, play, {})).is.true;
            expect(testPlayParts({duration: parseDurationComparison('< 7s')}, play, {})).is.false;
            expect(testPlayParts({duration: parseDurationComparison('> 7s')}, generatePlay({duration: undefined}), {})).is.false;
        });

        it('Tests parts with supplied typed testers', function () {
            const play = generatePlay({duration: 120, track: nameToCredit('My Song')});
            const testers = {duration: (test: number, p: PlayObject) => p.data.duration === test};
            expect(testPlayParts({duration: 120, title: 'Song'}, play, testers)).is.true;
            expect(testPlayParts({duration: 90}, play, testers)).is.false;
            expect(testPlayParts({title: 'Nope'}, play, {})).is.false;
            // @ts-expect-error built-in duration tester takes a DurationComparison, so a number tester must be supplied
            const typeCheckOnly = () => testPlayParts({duration: 120}, play, {});
            // @ts-expect-error bpm has no built-in tester so one must be supplied
            expect(() => testPlayParts({bpm: 120}, play, {})).to.throw('No tester');
        });
    });

    describe('Match Stage', function () {

        class TestMatch extends MatchTransformer {
            public test(play: PlayObject, stage: unknown) {
                const {matches = [], ...topLevel} = this.parseConfig(stage);
                return [topLevel, ...matches].some(unit => this.testRulesUnit(play, unit));
            }
        }
        const t = new TestMatch({name: 'test', type: 'match'}, {logger: loggerTest, cache: memorycache()});
        const base = {type: 'match'};
        const play = generatePlay({artists: [nameToCredit('Elephant Gym')]});
        play.meta.deviceId = 'abc';

        it('Requires every part to match', function () {
            expect(t.test(play, {...base, artists: 'Elephant', deviceId: 'abc'})).is.true;
            expect(t.test(play, {...base, artists: 'Elephant', deviceId: 'nope'})).is.false;
        });

        it('Matches any term in a part', function () {
            expect(t.test(play, {...base, deviceId: ['nope', 'abc']})).is.true;
        });

        it('Matches any rule set', function () {
            expect(t.test(play, {...base, deviceId: 'nope', matches: [{artists: 'Elephant'}]})).is.true;
            expect(t.test(play, {...base})).is.false;
        });

        it('Skips terms with unmet when', function () {
            expect(t.test(play, {...base, deviceId: {search: 'abc', when: {title: 'zzzzzz'}}})).is.false;
        });

        it('Tests duration with comparison', function () {
            const p = {...play, data: {...play.data, duration: 120}};
            expect(t.test(p, {...base, duration: '> 7 s'})).is.true;
            expect(t.test(p, {...base, duration: ['< 7 s', '= 2 minutes']})).is.true;
            expect(t.test(p, {...base, duration: {search: '< 7 s'}})).is.false;
        });

        it('Rejects invalid duration comparison and untestable parts', function () {
            expect(() => t.test(play, {...base, duration: '120'})).to.throw();
            expect(() => t.test(play, {...base, meta: '120'})).to.not.throw();
        });
    });

    describe('Match Stage Transforming', function () {

        it('Runs a match stage through transformPlay', async function () {
            const tmanager = new TestTransformerManager(loggerTest, transientCache());
            tmanager.addTransformerConfig({type: 'match', name: 'test'});
            const matchComponent = createTestComponent({
                transformManager: tmanager,
                options: {
                    playTransform: {
                        preCompare: [
                            {type: 'match', artists: 'Elephant', onSuccessAction: 'review', onFailure: 'continue'},
                            {type: 'match', artists: 'Nope', onFailureAction: 'discard', onFailure: 'continue'},
                        ]
                    }
                }
            });
            await matchComponent.buildTransformRules();

            const play = generatePlay({artists: [nameToCredit('Elephant Gym')]});
            const {play: transformed, steps} = await matchComponent.transformPlay(play, TRANSFORM_HOOK.preCompare, {useCachedResult: false});

            expect(steps.map(x => x.stageType)).eql(['match', 'match']);
            expect(steps[0].error).is.undefined;
            expect(steps[0].actionResult).eq('review');
            expect(steps[1].flowKnownState).eq('prereq');
            expect(steps[1].actionResult).eq('discard');
            // match never changes the Play
            expect(transformed.data).eql(play.data);
        });
    });

    describe('Credit Metadata', function () {

        it('User stage keeps ids for renamed credits', async function () {
            const t = new UserTransformer({name: 'test', type: 'user'}, {logger: loggerTest, cache: memorycache()});
            await t.initialize();
            const play = generatePlay({
                track: nameToCredit('My cool something track', mbMeta('mb-rec', 'recording')),
                artists: [nameToCredit('Some Artist', mbMeta('mb-a', 'artist'))]
            });

            const transformed = await t.handle(t.parseConfig({type: 'user', title: [{search: 'something', replace: 'bar'}], artists: [{search: 'Some', replace: 'Any'}]}), play);
            expect(transformed.data.track?.name).eq('My cool bar track');
            expect(creditMbid(transformed.data.track, 'recording')).eq('mb-rec');
            expect(transformed.data.artists?.[0].name).eq('Any Artist');
            expect(creditMbid(transformed.data.artists?.[0], 'artist')).eq('mb-a');
        });

        it('Native stage keeps ids for artists that are not changed by parsing', async function () {
            const t = new NativeTransformer({name: 'test', type: 'native'}, {logger: loggerTest, cache: memorycache()});
            await t.initialize();
            const play = generatePlay({
                track: nameToCredit('My Test (feat. Guest Artist)'),
                artists: [nameToCredit('Main Artist', mbMeta('mb-a', 'artist'))]
            });

            const transformed = await t.handle(t.parseConfig({type: 'native'}), play);
            expect(creditsToNames(transformed.data.artists!)).eql(['Main Artist', 'Guest Artist']);
            expect(creditMbid(transformed.data.artists?.[0], 'artist')).eq('mb-a');
        });

    });

    describe('Transform Manager', function() {

        it('Uses user transforms in the order supplied within component', async function() {
            const tConfigs: TransformerCommon[] = [
                {
                    type: 'user',
                    name: 't1',
                    defaults: {
                        title: [
                            {
                                search: "Cool",
                                replace: "Fun"
                            },
                            {
                                search: "Track",
                                replace: "Title"
                            }
                        ]
                    }
                },
                                {
                    type: 'user',
                    name: 't2',
                    defaults: {
                        title: [
                            {
                                search: "Cool",
                                replace: "Bar"
                            }
                        ]
                    }
                }
            ];
            const tmanager = new TransformerManager(loggerTest, transientCache());
            for(const t of tConfigs) {
                await tmanager.register(t);
            }

            const play = generatePlay({track: nameToCredit('My Cool Track')});

            const multiTransformComponent = createTestComponent({transformManager: tmanager});
            multiTransformComponent.config.options = {
                playTransform: {
                    preCompare: [
                        {
                            type: "user",
                            name: "t2"
                        },
                        {
                            type: "user",
                            name: "t1"
                        }
                    ]
                }
            };
            await multiTransformComponent.buildTransformRules();
            const {play: transformed} = await multiTransformComponent.transformPlay(play, TRANSFORM_HOOK.preCompare);
            expect(transformed.data.track?.name).eq('My Bar Title');
        });

        it('Handles transform config case-insensitive', async function() {
            const tConfigs: TransformerCommonConfig[] = [
                {
                    type: 'UsEr',
                    name: 't1',
                    defaults: {
                        title: [
                            {
                                search: "Cool",
                                replace: "Fun"
                            }
                        ]
                    }
                },
                {
                    type: 'UsEr',
                    name: 't2',
                    defaults: {
                        title: [
                            {
                                search: "Cool",
                                replace: "Fun"
                            }
                        ]
                    }
                }
            ];
            const tmanager = new TransformerManager(loggerTest, transientCache());
            for(const t of tConfigs) {
                tmanager.addTransformerConfig(t);
            }

            const multiTransformComponent = createTestComponent({transformManager: tmanager});
            multiTransformComponent.config.options = {
                playTransform: {
                    preCompare: [
                        {
                            // @ts-expect-error bad user input but should handle it
                            type: "usEr",
                            name: "t2"
                        },
                        {
                            // @ts-expect-error bad user input but should handle it
                            type: "User",
                            name: "t1"
                        }
                    ]
                }
            };
            await multiTransformComponent.buildTransformRules();
            expect(multiTransformComponent.transformRules.preCompare).to.exist;
            expect(multiTransformComponent.transformRules.preCompare![0].name).eq('t2')
            expect(multiTransformComponent.transformRules.preCompare![1].name).eq('t1')
        });

        it('Handles transform names case-insensitive', async function() {
            const tConfigs: TransformerCommonConfig[] = [
                {
                    type: 'user',
                    name: 'MyBarConfig',
                    defaults: {
                        title: [
                            {
                                search: "Cool",
                                replace: "Fun"
                            }
                        ]
                    }
                },
                {
                    type: 'user',
                    name: 'MyFooConfig',
                    defaults: {
                        title: [
                            {
                                search: "Cool",
                                replace: "Fun"
                            }
                        ]
                    }
                }
            ];
            const tmanager = new TransformerManager(loggerTest, transientCache());
            for(const t of tConfigs) {
                tmanager.addTransformerConfig(t);
            }

            const multiTransformComponent = createTestComponent({transformManager: tmanager});
            multiTransformComponent.config.options = {
                playTransform: {
                    preCompare: [
                        {
                            // @ts-expect-error bad user input but should handle it
                            type: "usEr",
                            name: "MYFOOCONFIG"
                        },
                        {
                            // @ts-expect-error bad user input but should handle it
                            type: "User",
                            name: "mybarconfig"
                        }
                    ]
                }
            };
            await multiTransformComponent.buildTransformRules();
            expect(multiTransformComponent.transformRules.preCompare).to.exist;
            expect(multiTransformComponent.transformRules.preCompare![0].name).eq('MYFOOCONFIG')
            expect(multiTransformComponent.transformRules.preCompare![1].name).eq('mybarconfig')
        });

        it('Registers metadata providers without any stage usage', async function() {
            const tmanager = new TestTransformerManager(loggerTest, transientCache());
            expect(tmanager.hasTransformerType('musicbrainz')).is.false;

            await tmanager.initProviders();

            expect(tmanager.getProviders()).to.have.all.keys('musicbrainz', 'rocksky');
            expect(tmanager.getTransformerType('musicbrainz')?.get('msdefault')?.isReady()).is.true;
            expect(tmanager.getTransformerType('rocksky')?.get('msdefault')?.isReady()).is.true;
        });

        it('Registers only preferred metadata providers', async function() {
            const tmanager = new TestTransformerManager(loggerTest, transientCache());
            tmanager.setPreferredProviders({musicbrainz: true});

            await tmanager.initProviders();

            expect(tmanager.getProviders()).to.have.all.keys('musicbrainz');
            expect(tmanager.hasTransformerType('rocksky')).is.false;
        });

        it('Registers a transformer once when requested concurrently', async function() {
            const tmanager = new TransformerManager(loggerTest, transientCache());
            const [a, b] = await Promise.all([
                tmanager.getTransformerByStage({type: 'user'}),
                tmanager.getTransformerByStage({type: 'user'})
            ]);
            expect(a).eq(b);
            expect(a.isReady()).is.true;
        });

        it('Does not wait on other transformers initializing', async function() {
            const tmanager = new TestTransformerManager(loggerTest, transientCache());
            tmanager.addTransformerConfig({type: 'user', name: 'slow'});
            tmanager.addTransformerConfig({type: 'user', name: 'fast'});
            tmanager.hanging.push('slow');

            void tmanager.getTransformerByStage({type: 'user', name: 'slow'});
            const fast = await tmanager.getTransformerByStage({type: 'user', name: 'fast'});

            expect(fast.name).eq('fast');
            expect(fast.isReady()).is.true;
        });

        it('Uses highest priority config for unnamed stage regardless of what is registered', async function() {
            const tmanager = new TransformerManager(loggerTest, transientCache());
            tmanager.addTransformerConfig({type: 'user', name: 'mine'});

            const def = await tmanager.getTransformerByStage({type: 'user', name: DEFAULT_TRANSFORMER_NAME});
            expect(def.name).eq(DEFAULT_TRANSFORMER_NAME);

            const unnamed = await tmanager.getTransformerByStage({type: 'user'});
            expect(unnamed.name).eq('mine');
        });
    });

    describe('Metadata Provider Search', function() {

        const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

        /** Skips real provider registration so searches run against the given fakes */
        class FakeProviderManager extends TransformerManager {
            constructor(providers: Record<string, () => Promise<TrackSearchResult[] | false>>) {
                super(loggerTest, transientCache());
                this.metadataInit = Promise.resolve();
                for(const [type, getTrackResults] of Object.entries(providers)) {
                    this.transformMetadataProviders[type as MetadataProviderStageType] = type;
                    this.transformers.set(type, new Map([[type, {isReady: () => true, getTrackResults} as unknown as AbstractTransformer]]));
                }
            }
        }

        const result = (service: string, score: number): TrackSearchResult => ({id: `${service}-${score}`, service, score, track: {name: 'Track'}});

        const buildManager = () => new FakeProviderManager({
            musicbrainz: async () => { await sleep(40); return [result('musicbrainz', 90), result('musicbrainz', 10)]; },
            spotify: async () => { await sleep(5); return [result('spotify', 50)]; },
            rocksky: async () => { await sleep(20); throw new Error('rocksky is down'); },
        });

        it('Streams each provider as soon as it settles', async function() {
            const lines = [];
            for await (const line of buildManager().streamTrackResults({track: {name: 'Track'}})) {
                lines.push(line);
            }
            expect(lines.map(x => x.service)).eql(['spotify', 'rocksky', 'musicbrainz']);
            expect(lines.map(x => x.type)).eql(['result', 'error', 'result']);
            const errorLine = lines[1];
            expect(errorLine.type === 'error' && errorLine.error.message).eq('rocksky is down');
            // survives being written to a response, a raw Error would become {}
            expect(JSON.parse(JSON.stringify(errorLine)).error.message).eq('rocksky is down');
        });

        it('Reports a provider that is not ready as an error', async function() {
            const tmanager = new FakeProviderManager({spotify: async () => false});
            const res = await tmanager.getTrackResults({track: {name: 'Track'}});
            expect(res.data).eql([]);
            expect(res.errors).eql([{service: 'spotify', error: {message: 'Not Ready'}}]);
        });

        it('Aggregates all providers sorted by score with errors', async function() {
            const res = await buildManager().getTrackResults({track: {name: 'Track'}});
            expect(res.data.map(x => x.score)).eql([90, 50, 10]);
            expect(res.errors.map(x => x.service)).eql(['rocksky']);
            expect(res.errors[0].error.message).eq('rocksky is down');
        });
    });

})
