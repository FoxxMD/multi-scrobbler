import { loggerTest, loggerDebug, childLogger } from "@foxxmd/logging";
import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { after, before, describe, it } from 'mocha';
import AbstractComponent from "../../common/AbstractComponent.ts";
import { TRANSFORM_HOOK } from "../../common/infrastructure/Atomic.ts";

import { isConditionalSearchAndReplace } from "../../utils/PlayTransformUtils.ts";
import { asPlays, generatePlay, normalizePlays } from "../utils/PlayTestUtils.ts";
import { WebhookPayload } from "../../common/infrastructure/config/health/webhooks.ts";

chai.use(asPromised);

class TestComponent extends AbstractComponent {
    public notify(payload: WebhookPayload): Promise<void> {
        throw new Error("Method not implemented.");
    }
    protected getIdentifier(): string {
        return 'test';
    }
    constructor() {
        super({});
    }
}

const component = new TestComponent();
component.logger = childLogger(loggerTest, 'App');

describe('Play Transforms', function () {

    beforeEach(function() {
       component.config = {};
       component.transformRules = undefined;
    });

    describe('Transform Config Parsing', function() {

        it('Sets transform rules as empty object if config is not present', function() {
            component.buildTransformRules();
            expect(component.transformRules).exist;
            expect(Object.keys(component.transformRules).length).eq(0);
        });

        it('Converts single object hook into hook array', function() {
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
            expect(component.transformRules.preCompare).to.have.nested.property('0.title');
        });

        it('Accepts hook array', function() {
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

        it('Converts transform config into real S&P data', function() {
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
            expect( isConditionalSearchAndReplace(component.transformRules.preCompare![0].title![0])).is.true
        });

        it('Converts transform config into real S&P data with default being empty string', function() {
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
            expect( isConditionalSearchAndReplace(component.transformRules.preCompare![0].title![0])).is.true
            expect( component.transformRules.preCompare![0].title![0].search).is.eq('something');
            expect( component.transformRules.preCompare![0].title![0].replace).is.eq('');
        });

        it('Respects transform config when it is already S&P data', function() {
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
            expect( isConditionalSearchAndReplace(component.transformRules.preCompare![0].title![0])).is.true
            expect( component.transformRules.preCompare![0].title![0].search).is.eq('nothing');
            expect( component.transformRules.preCompare![0].title![0].replace).is.eq('anything');
        });
    });

    describe('Play Transforming', function() {

        it('Returns original play if no hooks are defined', function () {
            component.buildTransformRules();

            const play = generatePlay();
            const transformed = component.transformPlay(play, TRANSFORM_HOOK.preCompare);
            expect(JSON.stringify(play)).equal(JSON.stringify(transformed));
        });

        it('Transforms when hook is present', function () {
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

            const play = generatePlay({track: 'My coolsomething track'});
            const transformed = component.transformPlay(play, TRANSFORM_HOOK.preCompare);
            expect(transformed.data.track).equal('My cool track');
        });

        it('Transforms consecutively when hook is present with multiple values', function () {
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

            const play = generatePlay({track: 'My coolsomething track'});
            const transformed = component.transformPlay(play, TRANSFORM_HOOK.preCompare);
            expect(transformed.data.track).equal('My  track');
        });

        it('Transforms using parsed regex', function () {
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

            const play = generatePlay({track: 'My cool something track'});
            const transformed = component.transformPlay(play, TRANSFORM_HOOK.preCompare);
            expect(transformed.data.track).equal('My cool thing track');
        });


        it('Transforms using parsed regex to get primary artist from delimited artist string', function () {
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

            const play = generatePlay({artists: ['My Artist One / My Artist Two / Another Guy']});
            const transformed = component.transformPlay(play, TRANSFORM_HOOK.preCompare);
            expect(transformed.data.artists).length(1)
            expect(transformed.data.artists[0]).equal('My Artist One');
        });

        it('Removes title when transform replaces with empty string', function () {
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

            const play = generatePlay({track: 'something'});
            const transformed = component.transformPlay(play, TRANSFORM_HOOK.preCompare);
            expect(transformed.data.track).is.undefined;
        });

        it('Removes album when transform replaces with empty string', function () {
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

            const play = generatePlay({album: 'something'});
            const transformed = component.transformPlay(play, TRANSFORM_HOOK.preCompare);
            expect(transformed.data.album).is.undefined;
        });

        it('Removes an artist when transform replaces with empty string', function () {
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

            const play = generatePlay({artists: ['something', 'big']});
            const transformed = component.transformPlay(play, TRANSFORM_HOOK.preCompare);
            expect(transformed.data.artists!.length).is.eq(1)
            expect(transformed.data.artists![0]).is.eq('big')
        });
    });

    describe('Conditional Transforming', function() {

        describe('On Hook', function () {
            it('Does not run hook if when conditions do not match', function () {
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

                const play = generatePlay({artists: ['something', 'big'], album: 'It Has No Match'});
                const transformed = component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                expect(transformed.data.artists!.length).is.eq(2)
                expect(transformed.data.artists![0]).is.eq('something')
            });

            it('Does run hook if when conditions matches', function () {
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

                const play = generatePlay({artists: ['something', 'big'], album: 'It Has This Match'});
                const transformed = component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                expect(transformed.data.artists!.length).is.eq(1)
                expect(transformed.data.artists![0]).is.eq('big')
            });
        });

        describe('On Search-And-Replace', function() {
            it('Does not run hook if when conditions do not match', function () {
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

                const play = generatePlay({artists: ['something', 'big'], album: 'It Has No Match'});
                const transformed = component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                expect(transformed.data.artists!.length).is.eq(2)
                expect(transformed.data.artists![0]).is.eq('something')
            });

            it('Does run hook if when conditions matches', function () {
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

                const play = generatePlay({artists: ['something', 'big'], album: 'It Has This Match'});
                const transformed = component.transformPlay(play, TRANSFORM_HOOK.preCompare);
                expect(transformed.data.artists!.length).is.eq(1)
                expect(transformed.data.artists![0]).is.eq('big')
            });
        });

    });

    describe('Multiple hook transforms', function() {

        it('Accumulates transforms', function() {
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
            const play = generatePlay({track: 'My cool something track'});
            const transformed = component.transformPlay(play, TRANSFORM_HOOK.preCompare);
            expect(transformed.data.track).equal('My cool final thing track');
        });

    });
})
