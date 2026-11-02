import type { DbConcrete } from "../database/drizzle/drizzleUtils.ts";
import type { MSAuth } from "./auth.ts";
import { ensureOwner } from "./owner.ts";
import { userHasPassword, type PasswordContext } from "./ownerPassword.ts";

export interface AuthState {
    ownerId: string
    ownerHasPassword: boolean
    /** When true, requests without a session are anonymous instead of acting as the owner */
    secured: boolean
}

export const computeAuthState = async (db: DbConcrete, ctx: PasswordContext): Promise<AuthState> => {
    const owner = await ensureOwner(db);
    const ownerHasPassword = await userHasPassword(ctx, owner.id);
    return {
        ownerId: owner.id,
        ownerHasPassword,
        secured: ownerHasPassword,
    };
}

/**
 * In-memory view of the auth state so the route guard does not hit the database on every request.
 *
 * Call refresh() after anything that changes it (owner password set)
 * */
export class AuthStateStore implements AuthState {
    ownerId!: string;
    ownerHasPassword: boolean = false;
    secured: boolean = false;

    protected auth: MSAuth;
    protected db: DbConcrete;

    constructor(auth: MSAuth, db: DbConcrete) {
        this.auth = auth;
        this.db = db;
    }

    refresh = async (): Promise<this> => {
        Object.assign(this, await computeAuthState(this.db, await this.auth.$context));
        return this;
    }
}
