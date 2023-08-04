/**
 * Shamelessly stolen from https://stackoverflow.com/a/43593634/1469797
 * */
class TupleMap<X,Y,Z> {
    private map = new Map<string, Z>();

    set(key: [X, Y], value: Z): this {
        this.map.set(JSON.stringify(key), value);
        return this;
    }

    get(key: [X, Y]): Z | undefined {
        return this.map.get(JSON.stringify(key));
    }

    clear() {
        this.map.clear();
    }

    delete(key: [X, Y]): boolean {
        return this.map.delete(JSON.stringify(key));
    }

    has(key: [X, Y]): boolean {
        return this.map.has(JSON.stringify(key));
    }

    get size() {
        return this.map.size;
    }

    values() {
        return this.map.values();
    }

    forEach(callbackfn: (value: Z, key: [X, Y], map: Map<[X, Y], Z>) => void, thisArg?: any): void {
        this.map.forEach((value, key) => {
            callbackfn.call(thisArg, value, JSON.parse(key), this);
        });
    }
}

export default TupleMap
