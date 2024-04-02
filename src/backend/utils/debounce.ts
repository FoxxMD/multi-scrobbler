// ES6 Async version of the "classic" JavaScript Debounce function.
// Works both with and without promises, so you can replace your existing
// debounce helper function with this one (and it will behave the same).
// The only difference is that this one returns a promise, so you can use
// it with async/await.
//
// I've converted this into a TypeScript module, and added a few more
// features to it, such as the ability to cancel the debounce, and also
// execute the function immediately, using the `doImmediately` method.
//
// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
//
// @author: @carlhannes
// @param {Function} func - The function to debounce.
// @param {Number} wait - The number of milliseconds to delay.
// @param {Boolean} immediate - Whether to execute the function at the beginning.
// @returns {Function} - The debounced function.
// @example
// import debounce from 'utils/debounce';
//
// const debounced = debounce(() => {
//   console.log('Hello world!');
// }, 1000);
//
// debounced();
//
// https://gist.github.com/carlhannes/4b318c28e95f635191bffb656b9a2cfe
export interface DebounceConstructor {
    (func: () => void, wait: number, immediate?: boolean): DebouncedFunction;
}

export interface DebouncedFunction {
    (...args: unknown[]): Promise<unknown>;
    cancel(): void;
    doImmediately(...args: unknown[]): Promise<unknown>;
}

export const debounce: DebounceConstructor = (func: () => void, wait: number, immediate?: boolean) => {
    let timeout: NodeJS.Timeout | null = null;
    const debouncedFn: DebouncedFunction = (...args) => new Promise((resolve) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            timeout = null;
            if (!immediate) {
                void Promise.resolve(func.apply(this, [...args])).then(resolve);
            }
        }, wait);
        if (immediate && !timeout) {
            void Promise.resolve(func.apply(this, [...args])).then(resolve);
        }
    });

    debouncedFn.cancel = () => {
        clearTimeout(timeout);
        timeout = null;
    };

    debouncedFn.doImmediately = (...args) => new Promise((resolve) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            timeout = null;
            void Promise.resolve(func.apply(this, [...args])).then(resolve);
        }, 0);
    });

    return debouncedFn;
};
