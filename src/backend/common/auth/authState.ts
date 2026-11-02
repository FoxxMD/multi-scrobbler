import type { DbConcrete } from "../database/drizzle/drizzleUtils.ts";
import type { MSAuth } from "./auth.ts";
import { ensureOwner } from "./owner.ts";
import { userHasPassword } from "./ownerPassword.ts";

/**
 * In-memory view of whether the instance is secured, so the route guard does not hit the database on every request.
 *
 * Call refresh() after anything that changes it (owner password set)
 * */
export class AuthStateStore {
    ownerId!: string;
    ownerHasPassword: boolean = false;

    protected auth: MSAuth;
    protected db: DbConcrete;

    constructor(auth: MSAuth, db: DbConcrete) {
        this.auth = auth;
        this.db = db;
    }

    /** When true, requests without a session are anonymous instead of acting as the owner */
    get secured(): boolean {
        return this.ownerHasPassword;
    }

    refresh = async (): Promise<this> => {
        const owner = await ensureOwner(this.db);
        this.ownerId = owner.id;
        this.ownerHasPassword = await userHasPassword(this.auth, owner.id);
        return this;
    }
}
