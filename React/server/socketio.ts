import { Server as SocketIOServer, Socket } from "socket.io";
import { IncomingMessage, ServerResponse } from "http";
import { Server as HTTPServer } from "http";
import { v4 as uuidv4 } from "uuid";
import session from "express-session";

interface Command {
    by: string;
    cmd: string;
    data: unknown;
    commandId?: string;
}

interface SendCommandInput {
    sessionId: string;
    command: Omit<Command, "commandId">;
    await?: boolean;
    timeoutMs?: number;
}

interface SessionData {
    id: string;
    ownerUserId: string;
    name?: string;
    createdAt: Date;
    members: Set<string>;
}

interface SessionInvite {
    inviteId: string;
    sessionId: string;
    fromUserId: string;
    toUserId: string;
    createdAt: Date;
    status: "pending" | "accepted" | "rejected";
}

type Ack<T> = (response: T) => void;

type AuthenticatedSocket = Socket & {
    data: Socket["data"] & { isAuthenticated?: boolean; userId?: string };
};

type SocketRequestWithSession = Socket["request"] & {
    sessionID?: string;
    session?: session.Session & { userId?: string };
};

export class SocketSessionService {
    private readonly io: SocketIOServer;
    private readonly connectedSocketsByUserId = new Map<string, Set<string>>();
    private readonly sessions = new Map<string, SessionData>();
    private readonly pendingInvites = new Map<string, SessionInvite>();
    private readonly pendingCommands = new Map<
        string,
        {
            resolve: (value: unknown) => void;
            reject: (reason?: unknown) => void;
            timeoutId: NodeJS.Timeout;
        }
    >();

    constructor(
        server: HTTPServer,
        sessionMiddleware: (req: any, res: any, next: (err?: any) => void) => void,
    ) {
        const clientOrigin = process.env.CLIENT_ORIGIN || `http://localhost:${process.env.WEB_PORT || 5173}`;
        this.io = new SocketIOServer(server, {
            cors: {
                origin: clientOrigin,
                methods: ["GET", "POST"],
                credentials: true,
            },
        });

        this.io.engine.use((req: IncomingMessage, res: ServerResponse, next: (err?: any) => void) => {
            sessionMiddleware(req, res, next);
        });
    }

    setup() {
        this.io.on("connection", (socket) => {
            const authedSocket = socket as AuthenticatedSocket;
            authedSocket.data.isAuthenticated = false;
            authedSocket.data.userId = undefined;

            const unauthenticateSocket = () => {
                const currentUserId = authedSocket.data.userId;
                if (currentUserId) {
                    this.detachSocketFromUser(socket.id, currentUserId);
                    socket.leave(this.getUserRoom(currentUserId));
                }
                authedSocket.data.isAuthenticated = false;
                authedSocket.data.userId = undefined;
            };

            console.log(`[Socket.IO] Cliente conectado: ${socket.id}`);

            socket.on(
                "auth_app",
                (
                    payload: { userId?: string; sessionId?: string },
                    callback?: Ack<{ ok: boolean; authenticated: boolean; error?: string }>,
                ) => {
                const userId = payload?.userId?.trim();
                const sessionId = payload?.sessionId?.trim();
                const req = socket.request as SocketRequestWithSession;
                const sessionUserId = req.session?.userId;
                const handshakeSessionId = req.sessionID;

                if (!userId) {
                    unauthenticateSocket();
                    callback?.({ ok: true, authenticated: false });
                    return;
                }

                if (!sessionId) {
                    unauthenticateSocket();
                    callback?.({ ok: true, authenticated: false });
                    return;
                }

                if (!sessionUserId || !handshakeSessionId) {
                    unauthenticateSocket();
                    callback?.({ ok: false, authenticated: false, error: "Sessao HTTP invalida ou expirada." });
                    return;
                }

                if (sessionUserId !== userId || handshakeSessionId !== sessionId) {
                    unauthenticateSocket();
                    callback?.({ ok: false, authenticated: false, error: "Falha de validação da sessao no socket." });
                    return;
                }

                unauthenticateSocket();
                this.attachSocketToUser(socket.id, userId);
                authedSocket.data.isAuthenticated = true;
                authedSocket.data.userId = userId;
                socket.join(this.getUserRoom(userId));

                const userSessions = this.getUserSessions(userId);
                socket.emit("session:list", userSessions);
                callback?.({ ok: true, authenticated: true });
            });

            socket.on(
                "session:create",
                (
                    payload: { name?: string },
                    callback?: Ack<{ ok: boolean; session?: { id: string; name?: string }; error?: string }>,
                ) => {
                    const userId = authedSocket.data.userId;
                    if (!userId) {
                        callback?.({ ok: false, error: "Não autenticado." });
                        return;
                    }

                    const sessionId = uuidv4();
                    const session: SessionData = {
                        id: sessionId,
                        ownerUserId: userId,
                        name: payload?.name?.trim() || undefined,
                        createdAt: new Date(),
                        members: new Set([userId]),
                    };

                    this.sessions.set(sessionId, session);
                    socket.join(this.getSessionRoom(sessionId));
                    this.pushSessionListToUser(userId);
                    callback?.({ ok: true, session: { id: sessionId, name: session.name } });
                },
            );

            socket.on(
                "session:list",
                (callback?: Ack<{ ok: boolean; sessions: Array<{ id: string; ownerUserId: string; name?: string; createdAt: string; members: string[] }> }>) => {
                    const userId = authedSocket.data.userId;
                    if (!userId) {
                        callback?.({ ok: false, sessions: [] });
                        return;
                    }

                    callback?.({ ok: true, sessions: this.getUserSessions(userId) });
                },
            );

            socket.on(
                "session:join",
                (payload: { sessionId: string }, callback?: Ack<{ ok: boolean; error?: string }>) => {
                    const userId = authedSocket.data.userId;
                    if (!userId) {
                        callback?.({ ok: false, error: "Não autenticado." });
                        return;
                    }

                    const session = this.sessions.get(payload?.sessionId);
                    if (!session || !session.members.has(userId)) {
                        callback?.({ ok: false, error: "Sessao não encontrada ou acesso negado." });
                        return;
                    }

                    socket.join(this.getSessionRoom(session.id));
                    callback?.({ ok: true });
                },
            );

            socket.on(
                "session:invite:send",
                (
                    payload: { sessionId: string; toUserId: string },
                    callback?: Ack<{ ok: boolean; inviteId?: string; error?: string }>,
                ) => {
                    const fromUserId = authedSocket.data.userId;
                    if (!fromUserId) {
                        callback?.({ ok: false, error: "Não autenticado." });
                        return;
                    }

                    const toUserId = payload?.toUserId?.trim();
                    const session = this.sessions.get(payload?.sessionId);
                    if (!session) {
                        callback?.({ ok: false, error: "Sessao não encontrada." });
                        return;
                    }

                    if (!session.members.has(fromUserId)) {
                        callback?.({ ok: false, error: "Somente membros podem convidar." });
                        return;
                    }

                    if (!toUserId) {
                        callback?.({ ok: false, error: "toUserId eh obrigatorio." });
                        return;
                    }

                    if (session.members.has(toUserId)) {
                        callback?.({ ok: false, error: "Usuario ja faz parte da sessao." });
                        return;
                    }

                    const inviteId = uuidv4();
                    const invite: SessionInvite = {
                        inviteId,
                        sessionId: session.id,
                        fromUserId,
                        toUserId,
                        createdAt: new Date(),
                        status: "pending",
                    };

                    this.pendingInvites.set(inviteId, invite);
                    this.io.to(this.getUserRoom(toUserId)).emit("session:invite:received", {
                        inviteId,
                        sessionId: session.id,
                        fromUserId,
                        toUserId,
                        createdAt: invite.createdAt.toISOString(),
                    });

                    callback?.({ ok: true, inviteId });
                },
            );

            socket.on(
                "session:invite:respond",
                (
                    payload: { inviteId: string; accept: boolean },
                    callback?: Ack<{ ok: boolean; error?: string; sessionId?: string }>,
                ) => {
                    const userId = authedSocket.data.userId;
                    if (!userId) {
                        callback?.({ ok: false, error: "Não autenticado." });
                        return;
                    }

                    const invite = this.pendingInvites.get(payload?.inviteId);
                    if (!invite || invite.status !== "pending") {
                        callback?.({ ok: false, error: "Convite invalido ou expirado." });
                        return;
                    }

                    if (invite.toUserId !== userId) {
                        callback?.({ ok: false, error: "Convite não pertence ao usuario." });
                        return;
                    }

                    const session = this.sessions.get(invite.sessionId);
                    if (!session) {
                        this.pendingInvites.delete(invite.inviteId);
                        callback?.({ ok: false, error: "Sessao não encontrada." });
                        return;
                    }

                    if (payload.accept) {
                        invite.status = "accepted";
                        session.members.add(userId);
                        this.joinAllUserSocketsToSession(userId, session.id);
                        this.pushSessionListToUser(userId);
                        this.pushSessionListToUser(invite.fromUserId);
                    } else {
                        invite.status = "rejected";
                    }

                    this.pendingInvites.delete(invite.inviteId);

                    this.io.to(this.getUserRoom(invite.fromUserId)).emit("session:invite:responded", {
                        inviteId: invite.inviteId,
                        sessionId: invite.sessionId,
                        toUserId: invite.toUserId,
                        accepted: payload.accept,
                    });

                    callback?.({ ok: true, sessionId: invite.sessionId });
                },
            );

            socket.on(
                "session:command:response",
                (payload: { commandId: string; data?: unknown; error?: string }) => {
                    const pending = this.pendingCommands.get(payload?.commandId);
                    if (!pending) {
                        return;
                    }

                    clearTimeout(pending.timeoutId);
                    this.pendingCommands.delete(payload.commandId);

                    if (payload.error) {
                        pending.reject(new Error(payload.error));
                        return;
                    }

                    pending.resolve(payload.data);
                },
            );

            socket.on("disconnect", () => {
                unauthenticateSocket();

                console.log(`[Socket.IO] Cliente desconectado: ${socket.id}`);
            });
        });

        console.log("[Socket.IO] Servico de sessoes em tempo real iniciado.");
    }

    async sendCommand(input: SendCommandInput) {
        const session = this.sessions.get(input.sessionId);
        if (!session) {
            throw new Error(`Sessao não encontrada: ${input.sessionId}`);
        }

        const shouldAwait = Boolean(input.await);
        const commandId = shouldAwait ? uuidv4() : undefined;
        const commandPayload: Command = {
            ...input.command,
            commandId,
        };

        this.io.to(this.getSessionRoom(session.id)).emit("session:command", commandPayload);

        if (!shouldAwait || !commandId) {
            return { sent: true, commandId: null };
        }

        return new Promise<unknown>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.pendingCommands.delete(commandId);
                reject(new Error(`Timeout aguardando resposta do comando ${commandId}.`));
            }, input.timeoutMs ?? 15000);

            this.pendingCommands.set(commandId, { resolve, reject, timeoutId });
        });
    }

    private getUserRoom(userId: string) {
        return `user:${userId}`;
    }

    private getSessionRoom(sessionId: string) {
        return `session:${sessionId}`;
    }

    private attachSocketToUser(socketId: string, userId: string) {
        const socketIds = this.connectedSocketsByUserId.get(userId) ?? new Set<string>();
        socketIds.add(socketId);
        this.connectedSocketsByUserId.set(userId, socketIds);
    }

    private detachSocketFromUser(socketId: string, userId: string) {
        const socketIds = this.connectedSocketsByUserId.get(userId);
        if (!socketIds) {
            return;
        }

        socketIds.delete(socketId);
        if (socketIds.size === 0) {
            this.connectedSocketsByUserId.delete(userId);
        }
    }

    private joinAllUserSocketsToSession(userId: string, sessionId: string) {
        const socketIds = this.connectedSocketsByUserId.get(userId);
        if (!socketIds) {
            return;
        }

        socketIds.forEach((socketId) => {
            this.io.sockets.sockets.get(socketId)?.join(this.getSessionRoom(sessionId));
        });
    }

    private pushSessionListToUser(userId: string) {
        const sessions = this.getUserSessions(userId);
        this.io.to(this.getUserRoom(userId)).emit("session:list", sessions);
    }

    private getUserSessions(userId: string) {
        return Array.from(this.sessions.values())
            .filter((session) => session.members.has(userId))
            .map((session) => ({
                id: session.id,
                ownerUserId: session.ownerUserId,
                name: session.name,
                createdAt: session.createdAt.toISOString(),
                members: Array.from(session.members),
            }));
    }
}
