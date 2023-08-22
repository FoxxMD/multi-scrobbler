// reproduced from https://github.com/sumn2u/string-comparison/blob/master/jscosine.js
// https://sumn2u.medium.com/string-similarity-comparision-in-js-with-examples-4bae35f13968

interface StrMap {
 [key: string]: number
}

interface BoolMap {
    [key: string]: boolean
}


function termFreqMap(str: string) {
    var words = str.split(' ');
    var termFreq: StrMap = {};
    words.forEach(function(w) {
        termFreq[w] = (termFreq[w] || 0) + 1;
    });
    return termFreq;
}

function addKeysToDict(map: StrMap, dict: BoolMap) {
    for (var key in map) {
        dict[key] = true;
    }
}

function termFreqMapToVector(map: StrMap, dict: StrMap): number[] {
    var termFreqVector = [];
    for (var term in dict) {
        termFreqVector.push(map[term] || 0);
    }
    return termFreqVector;
}

function vecDotProduct(vecA: number[], vecB: number[]) {
    var product = 0;
    for (var i = 0; i < vecA.length; i++) {
        product += vecA[i] * vecB[i];
    }
    return product;
}

function vecMagnitude(vec: number[]) {
    var sum = 0;
    for (var i = 0; i < vec.length; i++) {
        sum += vec[i] * vec[i];
    }
    return Math.sqrt(sum);
}

function cosineSimilarity(vecA: number[], vecB: number[]) {
    return vecDotProduct(vecA, vecB) / (vecMagnitude(vecA) * vecMagnitude(vecB));
}

const calculateCosineSimilarity = function textCosineSimilarity(strA: string, strB: string) {
    var termFreqA = termFreqMap(strA);
    var termFreqB = termFreqMap(strB);

    var dict = {};
    addKeysToDict(termFreqA, dict);
    addKeysToDict(termFreqB, dict);

    var termFreqVecA = termFreqMapToVector(termFreqA, dict);
    var termFreqVecB = termFreqMapToVector(termFreqB, dict);

    return cosineSimilarity(termFreqVecA, termFreqVecB);
}

export default calculateCosineSimilarity;
