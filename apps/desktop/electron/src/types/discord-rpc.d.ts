declare module "discord-rpc" {
  import { EventEmitter } from "node:events";

  class Client extends EventEmitter {
    accessToken: string | null;
    application: unknown;
    user: unknown;
    constructor(options: { transport: "ipc" | "websocket" });
    login(options: {
      clientId: string;
      clientSecret?: string;
      accessToken?: string;
      scopes?: string[];
      redirectUri?: string;
    }): Promise<Client>;
    getVoiceSettings(): Promise<unknown>;
    setVoiceSettings(settings: unknown): Promise<unknown>;
    destroy(): Promise<void>;
  }

  const RPC: { Client: typeof Client };
  export default RPC;
}
