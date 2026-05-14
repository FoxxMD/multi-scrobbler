import { loggerTest, loggerDebug, childLogger } from "@foxxmd/logging";
import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { after, before, describe, it } from 'mocha';
import AbstractComponent, { AbstractComponentConfig } from "../../common/AbstractComponent.js";

import { ConditionalSearchAndReplaceRegExp, STAGE_TYPES, STAGE_TYPES_METADATA, STAGE_TYPES_USER, TRANSFORM_HOOK } from "../../common/infrastructure/Transform.js";

import { isConditionalSearchAndReplace } from "../../utils/PlayTransformUtils.js";
import { generateArtistsStr, generatePlay } from "../../../core/PlayTestUtils.js";
import { WebhookPayload } from "../../common/infrastructure/config/health/webhooks.js";
import { findCauseByMessage } from "../../utils/ErrorUtils.js";
import NativeTransformer from "../../common/transforms/NativeTransformer.js";
import { initMemoryCache } from "../../common/Cache.js";
import { Cacheable } from "cacheable";
import { TransformerCommonConfig } from "../../../core/Atomic.js";
import TransformerManager from "../../common/transforms/TransformerManager.js";
import { transientCache } from "../utils/TransientTestUtils.js";
import dayjs from "dayjs";
import clone from "clone";
import { artistCreditsToNames, artistNamesToCredits } from "../../../core/StringUtils.js";

chai.use(asPromised);

class TestComponent extends AbstractComponent {
    public notify(payload: WebhookPayload): Promise<void> {
        throw new Error("Method not implemented.");
    }
    protected getIdentifier(): string {
        return 'test';
    }
    constructor(config?: AbstractComponentConfig) {
        super(config ?? {});
    }
}

const createTestComponent = (config?: AbstractComponentConfig): TestComponent => {
    const component = new TestComponent(config);
    component.logger = childLogger(loggerTest, 'App');
    return component;
}

const component = new TestComponent();
component.logger = childLogger(loggerTest, 'App');

const memorycache = () => new Cacheable({primary: initMemoryCache()})

describe('Play Transforms', function () {

    beforeEach(function () {
        component.config = {};
        component.transformRules = {};
    });
    describe('Transform Config Parsing', function () {

        it('Sets transform rules as empty object if config is not present', function () {
            component.buildTransformRules();
            expect(component.transformRules).exist;
            expect(Object.keys(component.transformRules).length).eq(0);
        });

        it('Converts single object hook into hook array', function () {
            component.config = {
                options: {
                    playTransform: {
                        preCompare: {
                            type: "user",
                            title: ['something']
                        }
                    }
                }
            }

            component.buildTransformRules();

            expect(component.transformRules.preCompare).to.be.an('array');
            expect(component.transformRules.preCompare).to.be.length(1);
            expect(component.transformRules.preCompare).to.have.nested.property('0.title');
        });

        describe('Stage Parsing', function () {

            it(`Throws an error if stage is an unexpected value`, function () {
                component.config = {
                    options: {
                        playTransform: {
                            preCompare: {
                                type: "test",
                                title: ['something']
                            }
                        }
                    }
                }

                // https://github.com/chaijs/chai/issues/655#issuecomment-204386414
                expect(() => component.buildTransformRules()).to.throw(Error).that.satisfies((e) => {
                    return findCauseByMessage(e, `No transformer of type 'test'`);
                });
            });

        });

        describe('User Stage Parsing', function () {

            it(`Assumes user 'type' if no type is present`, function () {
                component.config = {
                    options: {
                        playTransform: {
                            preCompare: {
                                title: ['something']
                            }
                        }
                    }
                }

                component.buildTransformRules();

                expect(component.transformRules.preCompare).to.be.an('array');
                expect(component.transformRules.preCompare).to.be.length(1);
                expect(component.transformRules.preCompare).to.have.nested.property('0.type');
                expect(component.transformRules.preCompare[0].type).eq('user');
            });

            it(`Allows user 'type'`, function () {
                component.config = {
                    options: {
                        playTransform: {
                            preCompare: {
                                type: "user",
                                title: ['something']
                            }
                        }
                    }
                }

                component.buildTransformRules();

                expect(component.transformRules.preCompare).to.be.an('array');
                expect(component.transformRules.preCompare).to.be.length(1);
                expect(component.transformRules.preCompare).to.have.nested.property('0.type');
                expect(component.transformRules.preCompare[0].type).eq('user');
            });

            it('Accepts hook array', function () {
                component.config = {
                    options: {
                        playTransform: {
                            preCompare: [
                                {
                                    title: ['something']
                                },
                                {
                                    title: ['something else']
                                }
                            ]
                        }
                    }
                }

                component.buildTransformRules();

                expect(component.transformRules.preCompare).to.be.an('array');
                expect(component.transformRules.preCompare).to.be.length(2);
                expect(component.transformRules.preCompare).to.have.nested.property('0.title');
                expect(component.transformRules.preCompare).to.have.nested.property('1.title')
            });

            it('Converts transform config into real S&P data', function () {
                component.config = {
                    options: {
                        playTransform: {
                            preCompare: {
                                title: ['something']
                            }
                        }
                    }
                }

                component.buildTransformRules();

                expect(component.transformRules.preCompare![0]).to.exist;
                expect(component.transformRules.preCompare![0].title).to.exist;
                expect(Array.isArray(component.transformRules.preCompare![0].title)).is.true;
                expect(isConditionalSearchAndReplace(component.transformRules.preCompare![0].title![0])).is.true
            });

            it('Converts transform config into real S&P data with default being empty string', function () {
                component.config = {
                    options: {
                        playTransform: {
                            preCompare: {
                                title: ['something']
                            }
                        }
                    }
                }

                component.buildTransformRules();

                expect(component.transformRules.preCompare![0]).to.exist;
                expect(component.transformRules.preCompare![0].title).to.exist;
                expect(Array.isArray(component.transformRules.preCompare![0].title)).is.true;
                expect(isConditionalSearchAndReplace(component.transformRules.preCompare![0].title![0])).is.true
                const title = component.transformRules.preCompare![0].title![0] as ConditionalSearchAndReplaceRegExp;
                expect(title.search).is.eq('something');
                expect(title.replace).is.eq('');
            });

            it('Respects transform config when it is already S&P data', function () {
                component.config = {
                    options: {
                        playTransform: {
                            preCompare: {
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

                component.buildTransformRules();

                expect(component.transformRules.preCompare![0]).to.exist;
                expect(component.transformRules.preCompare![0].title).to.exist;
                expect(Array.isArray(component.transformRules.preCompare![0].title)).is.true;
                expect(isConditionalSearchAndReplace(component.transformRules.preCompare![0].title![0])).is.true
                const title = component.transformRules.preCompare![0].title![0] as ConditionalSearchAndReplaceRegExp;
                expect(title.search).is.eq('nothing');
                expect(title.replace).is.eq('anything');
            });
        });

        describe('Non-User Stage Parsing', function () {

            describe('Non-User Stage Types', function () {

                for(const t of ['native']) {

                    it(`Allows non-user Stage Type ${t}`, function () {
                        component.config = {
                            options: {
                                playTransform: {
                                    preCompare: {
                                        type: t,
                                        title: true
                                    }
                                }
                            }
                        }

                        expect(() => component.buildTransformRules()).to.not.throw();
                        expect(component.transformRules.preCompare).to.be.an('array');
                        expect(component.transformRules.preCompare).to.be.length(1);
                        expect(component.transformRules.preCompare).to.have.nested.property('0.type');
                        expect(component.transformRules.preCompare[0].type).eq(t);
                    });

                }

            });

        });

        describe('Play Transforming', function () {

            it('Returns original play if no hooks are defined', async function () {
                component.buildTransformRules();

                const play = generatePlay();
                const transformed = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                expect(JSON.stringify(play)).equal(JSON.stringify(transformed));
            });

            describe('User Play Transforming', function () {
                it('Transforms when hook is present', async function () {
                    component.config = {
                        options: {
                            playTransform: {
                                preCompare: {
                                    title: ['something']
                                }
                            }
                        }
                    }
                    component.buildTransformRules();

                    const play = generatePlay({ track: 'My coolsomething track' });
                    const transformed = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                    expect(transformed.data.track).equal('My cool track');
                });

                it('Transforms consecutively when hook is present with multiple values', async function () {
                    component.config = {
                        options: {
                            playTransform: {
                                preCompare: {
                                    title: ['something', 'cool']
                                }
                            }
                        }
                    }
                    component.buildTransformRules();

                    const play = generatePlay({ track: 'My coolsomething track' });
                    const transformed = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                    expect(transformed.data.track).equal('My  track');
                });

                it('Transforms using parsed regex', async function () {
                    component.config = {
                        options: {
                            playTransform: {
                                preCompare: {
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
                    component.buildTransformRules();

                    const play = generatePlay({ track: 'My cool something track' });
                    const transformed = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                    expect(transformed.data.track).equal('My cool thing track');
                });


                it('Transforms using parsed regex to get primary artist from delimited artist string', async function () {
                    component.config = {
                        options: {
                            playTransform: {
                                preCompare: {
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
                    component.buildTransformRules();

                    const play = generatePlay({ artists: artistNamesToCredits(['My Artist One / My Artist Two / Another Guy']) });
                    const transformed = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                    expect(transformed.data.artists).length(1)
                    expect(transformed.data.artists[0].name).equal('My Artist One');
                });

                it('Removes title when transform replaces with empty string', async function () {
                    component.config = {
                        options: {
                            playTransform: {
                                preCompare: {
                                    title: ['something']
                                }
                            }
                        }
                    }
                    component.buildTransformRules();

                    const play = generatePlay({ track: 'something' });
                    const transformed = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                    expect(transformed.data.track).is.undefined;
                });

                it('Removes album when transform replaces with empty string', async function () {
                    component.config = {
                        options: {
                            playTransform: {
                                preCompare: {
                                    album: ['something']
                                }
                            }
                        }
                    }
                    component.buildTransformRules();

                    const play = generatePlay({ album: 'something' });
                    const transformed = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                    expect(transformed.data.album).is.undefined;
                });

                it('Removes an artist when transform replaces with empty string', async function () {
                    component.config = {
                        options: {
                            playTransform: {
                                preCompare: {
                                    artists: ['something']
                                }
                            }
                        }
                    }
                    component.buildTransformRules();

                    const play = generatePlay({ artists: artistNamesToCredits(['something', 'big']) });
                    const transformed = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
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
            const play = generatePlay({artists: artistNamesToCredits([str])});

            const transformedPlay = await t.handle(t.parseConfig({type: 'native'}), play);
            expect(artistCreditsToNames(transformedPlay.data.artists)).eql(primaries.concat(secondaries));
        });

        it('Ignores artists', async function() {

            const [str, primaries, secondaries] = generateArtistsStr({primary: {num: 2, ambiguousJoinedNames: false, trailingAmpersand: false, finalJoiner: false}, secondary: 0});

            const t = new NativeTransformer({name: 'test', type: 'native', defaults: {artistsIgnore: [str]}}, {logger: loggerTest, cache: memorycache()});

            await t.initialize();

            const play = generatePlay({artists: artistNamesToCredits([str]), track: 'My Test'});

            const transformedPlay = await t.handle(t.parseConfig({type: 'native'}), play);
            expect(artistCreditsToNames(transformedPlay.data.artists)).eql([str]);
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

            const play = generatePlay({artists: artistNamesToCredits([str]), track: 'My Test'});

            const transformedPlay = await t.handle(t.parseConfig({type: 'native'}), play);
            expect(artistCreditsToNames(transformedPlay.data.artists)).eql(primaries.concat(secondaries));
        });

    });

    describe('Conditional Transforming', function () {

        describe('On Hook', function () {
            it('Does not run hook if when conditions do not match', async function () {
                component.config = {
                    options: {
                        playTransform: {
                            preCompare: {
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
                component.buildTransformRules();

                const play = generatePlay({ artists: artistNamesToCredits(['something', 'big']), album: 'It Has No Match' });
                const transformed = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                expect(transformed.data.artists!.length).is.eq(2)
                expect(transformed.data.artists![0].name).is.eq('something')
            });

            it('Does run hook if when conditions matches', async function () {
                component.config = {
                    options: {
                        playTransform: {
                            preCompare: {
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
                component.buildTransformRules();

                const play = generatePlay({ artists: artistNamesToCredits(['something', 'big']), album: 'It Has This Match' });
                const transformed = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                expect(transformed.data.artists!.length).is.eq(1)
                expect(transformed.data.artists![0].name).is.eq('big')
            });
        });

        describe('On Search-And-Replace', function () {
            it('Does not run hook if when conditions do not match', async function () {
                component.config = {
                    options: {
                        playTransform: {
                            preCompare: {
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
                component.buildTransformRules();

                const play = generatePlay({ artists: artistNamesToCredits(['something', 'big']), album: 'It Has No Match' });
                const transformed = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                expect(transformed.data.artists!.length).is.eq(2)
                expect(transformed.data.artists![0].name).is.eq('something')
            });

            it('Does run hook if when conditions matches', async function () {
                component.config = {
                    options: {
                        playTransform: {
                            preCompare: {
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
                component.buildTransformRules();

                const play = generatePlay({ artists: artistNamesToCredits(['something', 'big']), album: 'It Has This Match' });
                const transformed = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                expect(transformed.data.artists!.length).is.eq(1)
                expect(transformed.data.artists![0].name).is.eq('big')
            });
        });

    });

    describe('Multiple hook transforms', function () {

        it('Accumulates transforms within a single stage', async function () {
            component.config = {
                options: {
                    playTransform: {
                        preCompare: [
                            {
                                title: [
                                    {
                                        search: "something",
                                        replace: "another else"
                                    }
                                ]
                            },
                            {
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

            component.buildTransformRules();
            const play = generatePlay({ track: 'My cool something track' });
            const transformed = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
            expect(transformed.data.track).equal('My cool final thing track');
        });

        it('Accumulates transforms across multiple stages', async function () {
            component.config = {
                options: {
                    playTransform: {
                        preCompare: [
                            {
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

            component.buildTransformRules();
            const play = generatePlay({ track: 'My cool something track', artists: artistNamesToCredits([str]) });
            const transformed = await component.transformPlay(play, TRANSFORM_HOOK.preCompare);
            expect(transformed.data.track).equal('My cool bar track');
            expect(artistCreditsToNames(transformed.data.artists)).eql(primaries.concat(secondaries));
        });

    });

    describe("Stage Caching", function () {

        it('Re-uses steps without modifying other Play properties', async function () {
            component.config = {
                options: {
                    playTransform: {
                        preCompare: [
                            {
                                name: "barChange",
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

            component.buildTransformRules();
            const play = generatePlay({ track: 'My cool something track', artists: artistNamesToCredits([str]), playDate: dayjs().subtract(10, 'm') });
            const transformed = await component.transformPlay(play, TRANSFORM_HOOK.preCompare, 'all');
            expect(transformed.data.track).equal('My cool bar track');
            expect(artistCreditsToNames(transformed.data.artists)).eql(primaries.concat(secondaries));

            const cachablePlay = clone(play);
            const laterDate = dayjs().subtract(5, 'm');
            cachablePlay.data.playDate = laterDate;
            const cacheTransformed = await component.transformPlay(cachablePlay, TRANSFORM_HOOK.preCompare, 'all');
            expect(cacheTransformed.data.track).equal('My cool bar track');
            expect(artistCreditsToNames(cacheTransformed.data.artists)).eql(primaries.concat(secondaries));
            expect(cacheTransformed.data.playDate.isSame(cachablePlay.data.playDate));
        });

    });

    describe('Transform Manager', function() {

        it('Uses user transforms in the order supplied within component', async function() {
            const tConfigs: TransformerCommonConfig[] = [
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
                tmanager.register(t);
            }

            const play = generatePlay({track: 'My Cool Track'});

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
            multiTransformComponent.buildTransformRules();
            const transformed = await multiTransformComponent.transformPlay(play, TRANSFORM_HOOK.preCompare);
            expect(transformed.data.track).eq('My Bar Title');
        });
    });

})
