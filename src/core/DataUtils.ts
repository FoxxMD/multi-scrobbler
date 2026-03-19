import { create as diffCreate } from "jsondiffpatch";


export const jdiff = diffCreate({
    propertyFilter(name, context) {
        return name !== 'lifecycle';
    },
    cloneDiffValues: true
    //omitRemovedValues: true
});
