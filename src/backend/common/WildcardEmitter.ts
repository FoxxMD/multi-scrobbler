import EventEmitter from "events";

type DefaultEventMap = [never];
type EventMap<T> = Record<keyof T, any[]> | DefaultEventMap;
type Key<K, T> = T extends DefaultEventMap ? string | symbol : K | keyof T;
type AnyRest = [...args: any[]];
type Args<K, T> = T extends DefaultEventMap ? AnyRest : (
        K extends keyof T ? T[K] : never
    );
type WildcardKey<T> = T extends DefaultEventMap ? string | symbol : keyof T;
type WildcardHandler<T> = (event: WildcardKey<T>, ...args: unknown[]) => void;

export class WildcardEmitter<T extends EventMap<T> = DefaultEventMap> extends EventEmitter<T> {

    private wildcardHandlers: Array<WildcardHandler<T>> = [];

    emit<K>(eventName: Key<K, T>, ...args: Args<K, T>): boolean {
        this.wildcardHandlers.forEach((h) => h(eventName as WildcardKey<T>, ...args));
        return super.emit(eventName, ...args);
    }

    onAny(handler: WildcardHandler<T>): () => void {
        this.wildcardHandlers.push(handler);
        return () => {
            this.wildcardHandlers = this.wildcardHandlers.filter((h) => h !== handler);
        };
    }

    removeAllListeners(eventName?: unknown): this {
        if (eventName === undefined) {
            this.wildcardHandlers = [];
        }
        return super.removeAllListeners(eventName as Key<unknown, T>);
    }
}