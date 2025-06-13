import { getListDiff, ListDiff } from "@donedeal0/superdiff";
import { PlayObject, TA_CLOSE, TA_DEFAULT_ACCURACY, TA_EXACT, TemporalAccuracy } from "../../core/Atomic.js";
import { buildTrackString } from "../../core/StringUtils.js";
import { playObjDataMatch } from "../utils.js";
import { comparePlayTemporally, hasAcceptableTemporalAccuracy, TemporalPlayComparisonOptions } from "./TimeUtils.js";


export const metaInvariantTransform = (play: PlayObject): PlayObject => {
    const {
        meta: {
            trackId
        } = {},
    } = play;
    return {
        ...play,
        meta: {
            trackId
        }
    }
}

export const playDateInvariantTransform = (play: PlayObject): PlayObject => {
    const {
        meta: {
            trackId
        } = {},
    } = play;
    return {
        ...play,
        data: {
            ...play.data,
            playDate: undefined
        }
    }
}


export type PlayTransformer = (play: PlayObject) => PlayObject;
export type ListTransformers = PlayTransformer[];

export const defaultListTransformers: ListTransformers = [metaInvariantTransform, playDateInvariantTransform];

export const getPlaysDiff = (aPlays: PlayObject[], bPlays: PlayObject[], transformers: ListTransformers = defaultListTransformers): ListDiff => {
    const cleanAPlays = transformers === undefined ? aPlays : transformers.reduce((acc: PlayObject[], curr) => acc.map(curr), aPlays);
    const cleanBPlays = transformers === undefined ? bPlays : transformers.reduce((acc: PlayObject[], curr) => acc.map(curr), bPlays);

    return getListDiff(cleanAPlays, cleanBPlays);
}

export const playsAreSortConsistent = (aPlays: PlayObject[], bPlays: PlayObject[], transformers: ListTransformers = defaultListTransformers) => {
    const diff = getPlaysDiff(aPlays, bPlays, transformers);
    return diff.status === 'equal';
}

export const getDiffIndexState = (results: any, index: number) => {
    const replaced = results.diff.filter(x => (x.status === 'deleted' && x.prevIndex === index) || (x.status === 'added' && x.newIndex === index));
    if(replaced.length === 2) {
        return 'replaced';
    }
    let diff = results.diff.find(x => x.newIndex === index);
    if(diff !== undefined) {
        return diff.status;
    }
    diff = results.diff.find(x => x.prevIndex === index);
    if(diff !== undefined) {
        return diff.status;
    }
    return undefined;
}

export type PlayOrderBumpedType = 'append' | 'prepend';
export type PlayOrderAddedType = PlayOrderBumpedType | 'insert';
export type PlayOrderChangeType = PlayOrderAddedType | PlayOrderBumpedType;


export type PlayOrderConsistencyResults<T extends PlayOrderChangeType> = [boolean, PlayObject[]?, T?]

export const playsAreAddedOnly = (aPlays: PlayObject[], bPlays: PlayObject[], transformers: ListTransformers = defaultListTransformers): PlayOrderConsistencyResults<PlayOrderAddedType> => {
    const results = getPlaysDiff(aPlays, bPlays, transformers);
     if(results.status === 'equal' || results.status === 'deleted') {
        return [false];
    }

    let addType: 'insert' | 'append' | 'prepend';
     for(const [index, play] of bPlays.entries()) {
         const isEqual = results.diff.some(x => x.status === 'equal' && x.prevIndex === index && x.newIndex === index);

         if(isEqual) {
             continue;
         }

         const replaced = results.diff.filter(x => (x.status === 'deleted' && x.prevIndex === index) || (x.status === 'added' && x.newIndex === index));
         if(replaced.length === 2) {
             addType = 'insert';
             return [false];
         }

         const moved = results.diff.some(x => x.status === 'moved' && x.newIndex === index);
         if(moved) {
             continue;
         }

         const added = results.diff.find(x => x.status === 'added' && x.newIndex === index);
         if(added !== undefined) {

             if(added.newIndex === 0) {
                 addType = 'prepend';
             } else if(added.newIndex === bPlays.length - 1) {
                 addType = 'append';
             } else {
                 const prevDiff = getDiffIndexState(results, index - 1);
                 const nextDiff = getDiffIndexState(results, index + 1);
                 if(prevDiff !== 'added' && nextDiff !== 'added') {
                     addType = 'insert';
                     return [false];
                 } else if(addType !== 'prepend' && nextDiff !== 'added') {
                     addType = 'insert';
                     return [false];
                 } else if(addType === 'prepend' && prevDiff !== 'added') {
                     return [false];
                 }
             }
         }
     }
    const added = results.diff.filter(x => x.status === 'added');
    return [addType !== 'insert' && addType !== undefined, added.map(x => bPlays[x.newIndex]), addType];
}

export const playsAreBumpedOnly = (aPlays: PlayObject[], bPlays: PlayObject[], transformers: ListTransformers = defaultListTransformers): PlayOrderConsistencyResults<PlayOrderBumpedType> => {
    const results = getPlaysDiff(aPlays, bPlays, transformers);
    if(results.status === 'equal' || results.status === 'deleted') {
       return [false];
   }
   if(aPlays.length !== bPlays.length) {
    return [false];
   }

   let addTypeShouldBe: 'append' | 'prepend';
   let cursor: 'moved' | 'equal';

   for(const [index, diffData] of results.diff.entries()) {
    if(diffData.status !== 'moved' && diffData.status !== 'equal') {
        return [false];
    }

        if(index === 0) {
            if(diffData.status === 'moved' && diffData.indexDiff < 0) {
               addTypeShouldBe = 'prepend';
            } else if(diffData.status === 'equal') {
                addTypeShouldBe = 'append';
            } else {
                return [false];
            }
        } else {

            if(index === results.diff.length - 1) {
                if(addTypeShouldBe === 'append' && diffData.status !== 'moved') {
                    return [false];
                }
            } else {

                if(![-1,0,1].includes(diffData.indexDiff)) {
                    return [false]; // shifted more than one spot in list which isn't a bump
                }
                if(cursor === undefined) { // first non-initial item
                    cursor = diffData.status;
                    continue;
                } else if(
                    (addTypeShouldBe === 'prepend' && cursor === 'equal' && diffData.status === 'moved')
                    || (addTypeShouldBe === 'append' && cursor === 'moved' && diffData.status === 'equal')
                ) {
                    // can't go back from equal (passed bump point) to moved b/c would mean more than one item moved and not just one bump
                    return [false];
                }

                // otherwise intermediate
                cursor = diffData.status;
            }
        }
   }

   return [true, addTypeShouldBe === 'prepend' ? [bPlays[0]] : [bPlays[bPlays.length - 1]], addTypeShouldBe];
}

export const humanReadableDiff = (aPlay: PlayObject[], bPlay: PlayObject[], result: ListDiff): string => {
    const changes: [string, string?][] = [];
    for(const [index, play] of bPlay.entries()) {
        const ab: [string, string?] = [`${index + 1}. ${buildTrackString(play, {include: ['artist', 'track', 'trackId', 'album', 'comment']})}`];

        const isEqual = result.diff.some(x => x.status === 'equal' && x.prevIndex === index && x.newIndex === index);
        if(!isEqual) {
            const moved = result.diff.filter(x => x.status === 'moved' && x.newIndex === index);
            if(moved.length > 0) {
                ab.push(`Moved -  Originally at ${moved[0].prevIndex + 1}`);
            } else {
                // look for replaced first
                const replaced = result.diff.filter(x => (x.status === 'deleted' && x.prevIndex === index) || (x.status === 'added' && x.newIndex === index));
                if(replaced.length === 2) {
                    const newPlay = replaced.filter(x => x.status === 'deleted');
                    ab.push(`Replaced - Original => ${buildTrackString( newPlay[0].value)}`);
                } else {
                    const added = result.diff.some(x => x.status === 'added' && x.newIndex === index);
                    if(added) {
                        ab.push('Added');
                    } else {
                        // was updated, probably??
                        const updated = result.diff.filter(x => x.status === 'deleted' && x.prevIndex === index);
                        if(updated.length > 0) {
                            ab.push(`Updated - Original => ${buildTrackString( aPlay[updated[0].prevIndex])}`);
                        } else {
                            ab.push('Should not have gotten this far!');
                        }
                    }
                }
            }
        }
        changes.push(ab);
    }
    return changes.map(([a,b]) => {
       if(b === undefined) {
           return a;
       }
       return `${a} => ${b}`;
    }).join('\n');
}

export const genericSourcePlayMatch = (a: PlayObject, b: PlayObject, t?: TemporalAccuracy[], temporalOptions?: TemporalPlayComparisonOptions): boolean =>
    playObjDataMatch(a, b)
    && hasAcceptableTemporalAccuracy(comparePlayTemporally(a, b, temporalOptions).match, t);