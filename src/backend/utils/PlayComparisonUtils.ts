import { getListDiff } from "@donedeal0/superdiff";
import { PlayObject } from "../../core/Atomic.js";
import { buildTrackString } from "../../core/StringUtils.js";


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

export const getPlaysDiff = (aPlays: PlayObject[], bPlays: PlayObject[], transformers: ListTransformers = defaultListTransformers) => {
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

export const playsAreAddedOnly = (aPlays: PlayObject[], bPlays: PlayObject[], transformers: ListTransformers = defaultListTransformers): [boolean, PlayObject[]?, ('append' | 'prepend' | 'insert')?] => {
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
    return [addType !== 'insert', added.map(x => bPlays[x.newIndex]), addType];
}

export const humanReadableDiff = (aPlay: PlayObject[], bPlay: PlayObject[], result: any): string => {
    const changes: [string, string?][] = [];
    for(const [index, play] of bPlay.entries()) {
        const ab: [string, string?] = [`${index + 1}. ${buildTrackString(play)}`];

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
                            ab.push(`Updated - Original => ${buildTrackString( aPlay[updated[0].preIndex])}`);
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
