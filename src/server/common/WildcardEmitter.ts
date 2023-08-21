import EventEmitter from "events";

export class WildcardEmitter extends EventEmitter {
    emit(type: string, ...args: any) {
        const argsWithName = args.length === 0 ? [type] : [...args, type];
        super.emit('*', ...argsWithName);
        return super.emit(type, ...argsWithName) || super.emit('', ...argsWithName);
    }
}
