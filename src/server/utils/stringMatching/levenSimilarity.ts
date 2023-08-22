import leven from "leven";

const levenSimilarity = (valA: string, valB: string) => {
    let longer: string;
    let shorter: string;
    if (valA.length > valB.length) {
        longer = valA;
        shorter = valB;
    } else {
        longer = valB;
        shorter = valA;
    }

    const distance = leven(longer, shorter);
    const diff = (distance / longer.length) * 100;
    return [distance, 100 - diff];
}

export default levenSimilarity;
