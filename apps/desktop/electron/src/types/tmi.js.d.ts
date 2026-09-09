declare module "tmi.js" {
    import { EventEmitter } from "node:events";

    export type ClientOptions = {
        connection?: { secure?: boolean; reconnect?: boolean };
        identity?: { username: string; password: string };
        channels?: string[];
    };

    export class Client extends EventEmitter {
        constructor(options?: ClientOptions);
        connect(): Promise<[string, number]>;
        disconnect(): Promise<[string, number]>;
        getChannels(): string[];
        join(channel: string): Promise<[string]>;
        part(channel: string): Promise<[string]>;
    }

    const tmi: { Client: typeof Client };
    export default tmi;
}
