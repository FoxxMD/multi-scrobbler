
declare module 'passport-deezer' {
    //import {Strategy as Oauth2Strategy} from 'passport-oauth2';
    import {Strategy as PassportStrategy} from "passport";
    export class Strategy extends PassportStrategy {
        constructor(options: any, verify: any);
    }
}
