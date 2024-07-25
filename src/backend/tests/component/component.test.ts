import { loggerTest } from "@foxxmd/logging";
import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { after, before, describe, it } from 'mocha';
import { PlayObject } from "../../../core/Atomic.js";
import AbstractComponent from "../../common/AbstractComponent.js";
import { TRANSFORM_HOOK } from "../../common/infrastructure/Atomic.js";
import { isSearchAndReplace } from "../../utils.js";
import { asPlays, generatePlay, normalizePlays } from "../utils/PlayTestUtils.js";

chai.use(asPromised);

class TestComponent extends AbstractComponent {
    constructor() {
        super({});
    }
}

const component = new TestComponent();
component.logger = loggerTest;

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

            expect(component.transformRules.preCompare).to.exist;
            expect(component.transformRules.preCompare.title).to.exist;
            expect(Array.isArray(component.transformRules.preCompare.title)).is.true;
            expect( isSearchAndReplace(component.transformRules.preCompare.title[0])).is.true
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

            expect(component.transformRules.preCompare).to.exist;
            expect(component.transformRules.preCompare.title).to.exist;
            expect(Array.isArray(component.transformRules.preCompare.title)).is.true;
            expect( isSearchAndReplace(component.transformRules.preCompare.title[0])).is.true
            expect( component.transformRules.preCompare.title[0].search).is.eq('something');
            expect( component.transformRules.preCompare.title[0].replace).is.eq('');
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

            expect(component.transformRules.preCompare).to.exist;
            expect(component.transformRules.preCompare.title).to.exist;
            expect(Array.isArray(component.transformRules.preCompare.title)).is.true;
            expect( isSearchAndReplace(component.transformRules.preCompare.title[0])).is.true
            expect( component.transformRules.preCompare.title[0].search).is.eq('nothing');
            expect( component.transformRules.preCompare.title[0].replace).is.eq('anything');
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
    });


})
