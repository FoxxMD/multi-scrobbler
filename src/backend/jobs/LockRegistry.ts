/**
 * In-memory exclusive locks shared by job processes and (later) cleanup tasks.
 *
 * Keys:
 * * `mirror-import:{id}` only one import may write to a mirror at a time
 * */
export class LockRegistry {

    protected locks: Map<string, string> = new Map();

    /** Returns true if acquired. Re-acquiring a key you already hold succeeds */
    tryAcquire(key: string, holder: string): boolean {
        const existing = this.locks.get(key);
        if (existing !== undefined && existing !== holder) {
            return false;
        }
        this.locks.set(key, holder);
        return true;
    }

    holder(key: string): string | undefined {
        return this.locks.get(key);
    }

    release(key: string, holder: string): void {
        if (this.locks.get(key) === holder) {
            this.locks.delete(key);
        }
    }
}
