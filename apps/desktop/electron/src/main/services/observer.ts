import { EventEmitter } from "events";

export type ObserverPayload = {
    id: string;
    channel: string;
    origin?: string;
    data?: unknown;
    sourceId: string;
    timestamp: number;
};

export class ObserverService extends EventEmitter {
    constructor() {
        super();
    }

    // Sobrescreve o 'on' para aceitar apenas nossos eventos
    override on(
        eventName: string | symbol,
        listener: (payload: Partial<ObserverPayload>) => void
    ): this {
        return super.on(eventName, listener);
    }

    // Sobrescreve o 'emit' para validar os dados enviados
    override emit(
        eventName: string | symbol,
        payload: Partial<ObserverPayload>
    ): boolean {
        return super.emit(eventName, payload);
    }

    subscribe(eventName: string, listener: (payload: Partial<ObserverPayload>) => void) {
        this.on(eventName, listener);
    }

    publish(payload: Partial<ObserverPayload>, sourceId?: string) {
        const normalizedPayload: ObserverPayload = {
            id: String(payload.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`),
            channel: String(payload.channel || "GLOBAL"),
            data: payload.data,
            sourceId: String(payload.sourceId || sourceId),
            timestamp: Number(payload.timestamp || Date.now()),
        };
        this.emit(normalizedPayload.channel, normalizedPayload);
        this.emit('GLOBAL', normalizedPayload);
        this.emit('_IPCMAIN_PUBLISH_ENVENT_', normalizedPayload);
    }
}

export const observerService = new ObserverService();
