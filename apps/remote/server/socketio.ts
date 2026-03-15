import { IncomingMessage, ServerResponse } from "http";
import session from "express-session";
import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { DatabaseService } from "./database.js";

type SocketRequestWithSession = Socket["request"] & {
  sessionID?: string;
  session?: session.Session & { userId?: string };
};

type AppDevice = {
  hwid: string;
  name: string;
  userId: string;
  deviceId: string;
  socketId: string;
  connectedAt: number;
};

type AuthedData = {
  authenticated: boolean;
  userId: string | null;
  hwid?: string;
};

type Ack<T> = (response: T) => void;

export class RemoteSocketService {
  private readonly io: SocketIOServer;
  private readonly database: DatabaseService;
  private readonly appSocketsByHwid = new Map<string, string>();
  private readonly devicesByUser = new Map<string, Map<string, AppDevice>>();
  private readonly connectedUsersByDevice = new Map<string, Map<string, { socketId: string; connectedAt: number }>>();
  private appNsp?: ReturnType<SocketIOServer["of"]>;
  private webNsp?: ReturnType<SocketIOServer["of"]>;

  constructor(
    server: HTTPServer,
    sessionMiddleware: (req: any, res: any, next: (err?: any) => void) => void,
    database: DatabaseService,
  ) {
    const clientOrigin = process.env.CLIENT_ORIGIN || `http://localhost:${process.env.WEB_PORT || 5173}`;
    this.io = new SocketIOServer(server, {
      cors: {
        origin: clientOrigin,
        methods: ["GET", "POST"],
        credentials: true,
      },
      // Aumenta limite de payload para suportar base64 de imagens
      maxHttpBufferSize: 100 * 1024 * 1024, // 100MB
    });
    this.database = database;

    this.io.engine.use((req: IncomingMessage, res: ServerResponse, next: (err?: any) => void) => {
      sessionMiddleware(req, res, next);
    });
  }

  setup() {
    const appNsp = this.io.of("/app");
    const webNsp = this.io.of("/web");
    this.appNsp = appNsp;
    this.webNsp = webNsp;

    appNsp.on("connection", (socket) => {
      (socket.data as AuthedData).authenticated = false;
      (socket.data as AuthedData).userId = null;

      const unauth = () => {
        const data = socket.data as AuthedData;
        if (data.userId && data.hwid) {
          this.detachDevice(data.userId, data.hwid, socket.id);
          this.emitConnectionsList(webNsp, data.userId);
        }
        data.authenticated = false;
        data.userId = null;
        data.hwid = undefined;
      };

      socket.on(
        "auth_app",
        (
          payload: { userId?: string; sessionId?: string; hwid?: string; name?: string },
          cb?: Ack<{ ok: boolean; authenticated: boolean; error?: string }>,
        ) => {
          const userId = String(payload?.userId || "").trim();
          const sessionId = String(payload?.sessionId || "").trim();
          const hwid = String(payload?.hwid || "").trim();
          const name = String(payload?.name || "").trim();

          const req = socket.request as SocketRequestWithSession;
          const sessionUserId = String(req.session?.userId || "").trim();
          const handshakeSessionId = String(req.sessionID || "").trim();

          if (!userId || !sessionId || !hwid || !name) {
            unauth();
            cb?.({ ok: true, authenticated: false });
            return;
          }

          if (!sessionUserId || !handshakeSessionId) {
            unauth();
            cb?.({ ok: false, authenticated: false, error: "Invalid HTTP session." });
            return;
          }

          if (sessionUserId !== userId || handshakeSessionId !== sessionId) {
            unauth();
            cb?.({ ok: false, authenticated: false, error: "Socket session validation failed." });
            return;
          }

          void (async () => {
            try {
              const device = await this.database.upsertDevice({ ownerUserId: userId, hwid, name });
              unauth();
              (socket.data as AuthedData).authenticated = true;
              (socket.data as AuthedData).userId = userId;
              (socket.data as AuthedData).hwid = hwid;
              socket.join(this.userRoom(userId));

              this.attachDevice({
                userId,
                hwid,
                name: device.name,
                deviceId: device.id,
                socketId: socket.id,
                connectedAt: Date.now(),
              });

              cb?.({ ok: true, authenticated: true });
              this.emitConnectionsList(webNsp, userId);
              this.emitDeviceStatusUpdate(userId, device.id);
            } catch (error: any) {
              unauth();
              cb?.({ ok: false, authenticated: false, error: error?.message || "Device registration failed." });
            }
          })();
        },
      );

      // Legacy: webdeck:changed - now handled by app:observer:event with full data

      socket.on("disconnect", () => {
        unauth();
      });

      socket.on(
        "app:observer:event",
        (payload: { event?: { type?: string; data?: unknown } }) => {
          const data = socket.data as AuthedData;
          if (!data.authenticated || !data.userId || !data.hwid) return;
          const device = this.devicesByUser.get(data.userId)?.get(data.hwid);
          if (!device || !this.webNsp) return;
          
          const eventType = payload?.event?.type;
          
          // Se for apps:changed, também emite para o device room
          if (eventType === "apps:changed") {
            webNsp.to(this.deviceRoom(data.hwid)).emit("apps:changed", {
              deviceId: device.deviceId,
              hwid: data.hwid,
              timestamp: (payload?.event?.data as { timestamp?: number })?.timestamp ?? Date.now(),
            });
          }
          
          // Emite observer:event para TODAS as rooms relevantes
          // 1. User room (para todos os usuários conectados)
          webNsp.to(this.userRoom(data.userId)).emit("observer:event", {
            hwid: data.hwid,
            event: payload?.event ?? null,
          });
          // 2. Device room (para quem está conectado ao dispositivo específico)
          webNsp.to(this.deviceRoom(data.hwid)).emit("observer:event", {
            hwid: data.hwid,
            event: payload?.event ?? null,
          });
        },
      );
    });

    webNsp.on("connection", (socket) => {
      (socket.data as AuthedData).authenticated = false;
      (socket.data as AuthedData).userId = null;

      const unauth = () => {
        const data = socket.data as AuthedData;
        if (data.userId) {
          socket.leave(this.userRoom(data.userId));
        }
        data.authenticated = false;
        data.userId = null;
      };

      socket.on(
        "auth_web",
        (
          payload: { userId?: string; sessionId?: string },
          cb?: Ack<{ ok: boolean; authenticated: boolean; error?: string }>,
        ) => {
          const userId = String(payload?.userId || "").trim();
          const sessionId = String(payload?.sessionId || "").trim();
          const req = socket.request as SocketRequestWithSession;
          const sessionUserId = String(req.session?.userId || "").trim();
          const handshakeSessionId = String(req.sessionID || "").trim();

          if (!userId || !sessionId) {
            unauth();
            cb?.({ ok: true, authenticated: false });
            return;
          }

          if (!sessionUserId || !handshakeSessionId) {
            unauth();
            cb?.({ ok: false, authenticated: false, error: "Invalid HTTP session." });
            return;
          }

          if (sessionUserId !== userId || handshakeSessionId !== sessionId) {
            unauth();
            cb?.({ ok: false, authenticated: false, error: "Socket session validation failed." });
            return;
          }

          unauth();
          (socket.data as AuthedData).authenticated = true;
          (socket.data as AuthedData).userId = userId;
          socket.join(this.userRoom(userId));
          cb?.({ ok: true, authenticated: true });
          this.emitConnectionsList(webNsp, userId, socket);
        },
      );

      socket.on("connections:list", () => {
        const data = socket.data as AuthedData;
        if (!data.authenticated || !data.userId) return;
        this.emitConnectionsList(webNsp, data.userId, socket);
      });

      socket.on(
        "device:attach",
        (payload: { hwid?: string }, cb?: Ack<{ ok: boolean; error?: string }>) => {
          const data = socket.data as AuthedData;
          if (!data.authenticated || !data.userId) {
            cb?.({ ok: false, error: "Not authenticated." });
            return;
          }
          const hwid = String(payload?.hwid || "").trim();
          if (!hwid) {
            cb?.({ ok: false, error: "Missing hwid." });
            return;
          }
          const device = this.devicesByUser.get(data.userId)?.get(hwid);
          if (device) {
            socket.join(this.deviceRoom(hwid));
            (socket.data as AuthedData).hwid = hwid;
            this.registerConnectedUser(device.deviceId, data.userId, socket.id);
            cb?.({ ok: true });
            return;
          }

          void (async () => {
            const allowed = await this.canAccessDevice(data.userId!, hwid);
            if (!allowed.ok) {
              cb?.({ ok: false, error: allowed.error || "Access denied." });
              return;
            }
            socket.join(this.deviceRoom(hwid));
            (socket.data as AuthedData).hwid = hwid;
            this.registerConnectedUser(allowed.deviceId!, data.userId!, socket.id);
            cb?.({ ok: true });
          })();
        },
      );

      socket.on(
        "device:command",
        (
          payload: { hwid?: string; cmd?: string; data?: unknown; timeoutMs?: number },
          cb?: Ack<{ ok: boolean; data?: unknown; error?: string }>,
        ) => {
          const data = socket.data as AuthedData;
          if (!data.authenticated || !data.userId) {
            cb?.({ ok: false, error: "Not authenticated." });
            return;
          }

          const hwid = String(payload?.hwid || "").trim();
          const cmd = String(payload?.cmd || "").trim();
          if (!hwid || !cmd) {
            cb?.({ ok: false, error: "Missing hwid/cmd." });
            return;
          }

          const appSocketId = this.appSocketsByHwid.get(hwid);
          if (!appSocketId) {
            cb?.({ ok: false, error: "Device socket not available." });
            return;
          }

          const appSocket = appNsp.sockets.get(appSocketId);
          if (!appSocket) {
            cb?.({ ok: false, error: "Device socket not available." });
            return;
          }

          void (async () => {
            const allowed = await this.canAccessDevice(data.userId!, hwid);
            if (!allowed.ok) {
              cb?.({ ok: false, error: allowed.error || "Access denied." });
              return;
            }
            // Aumenta timeout padrão para 60s (media em base64 pode demorar)
            const timeoutMs = Number(payload?.timeoutMs || 60000);
            
            // Garante que o callback só seja chamado uma vez
            let cbCalled = false;
            const safeCb = (response: { ok: boolean; data?: unknown; error?: string }) => {
              if (cbCalled) return;
              cbCalled = true;
              cb?.(response);
            };
            
            appSocket.timeout(timeoutMs).emit(
              "app:command",
              { cmd, data: payload?.data ?? null },
              (err: any, response?: { ok: boolean; data?: unknown; error?: string }) => {
                if (err) {
                  safeCb({ ok: false, error: "Command timeout." });
                  return;
                }
                if (!response?.ok) {
                  safeCb({ ok: false, error: response?.error || "Command failed." });
                  return;
                }
                safeCb({ ok: true, data: response.data });
              },
            );
          })();
        },
      );

      socket.on("disconnect", () => {
        const data = socket.data as AuthedData;
        if (data.userId && data.hwid) {
          const device = this.devicesByUser.get(data.userId)?.get(data.hwid);
          if (device) {
            this.unregisterConnectedUser(device.deviceId, data.userId, socket.id);
          }
        }
        unauth();
      });
    });
  }

  emitUserUpdated(userId: string, payload: unknown, excludeSocketId?: string) {
    if (!this.appNsp || !this.webNsp) return;
    const room = this.userRoom(userId);
    if (excludeSocketId) {
      this.appNsp.to(room).except(excludeSocketId).emit("user:updated", payload);
      this.webNsp.to(room).except(excludeSocketId).emit("user:updated", payload);
      return;
    }
    this.appNsp.to(room).emit("user:updated", payload);
    this.webNsp.to(room).emit("user:updated", payload);
  }

  emitFriendRequest(toUserId: string, payload: unknown) {
    if (!this.appNsp || !this.webNsp) return;
    const room = this.userRoom(toUserId);
    this.appNsp.to(room).emit("friends:request", payload);
    this.webNsp.to(room).emit("friends:request", payload);
  }

  emitFriendsUpdated(userId: string) {
    if (!this.appNsp || !this.webNsp) return;
    const room = this.userRoom(userId);
    this.appNsp.to(room).emit("friends:updated", { userId });
    this.webNsp.to(room).emit("friends:updated", { userId });
  }

  emitDeviceAccessRequest(ownerUserId: string, payload: unknown) {
    if (!this.appNsp || !this.webNsp) return;
    const room = this.userRoom(ownerUserId);
    this.appNsp.to(room).emit("device:access:request", payload);
    this.webNsp.to(room).emit("device:access:request", payload);
  }

  emitDeviceAccessResolved(targetUserId: string, payload: unknown) {
    if (!this.appNsp || !this.webNsp) return;
    const room = this.userRoom(targetUserId);
    this.appNsp.to(room).emit("device:access:resolved", payload);
    this.webNsp.to(room).emit("device:access:resolved", payload);
  }

  emitDeviceSessionsUpdated(ownerUserId: string, deviceId: string) {
    if (!this.appNsp || !this.webNsp) return;
    const room = this.userRoom(ownerUserId);
    const payload = { deviceId };
    this.appNsp.to(room).emit("device:sessions:updated", payload);
    this.webNsp.to(room).emit("device:sessions:updated", payload);
  }

  emitDeviceInvitesUpdated(ownerUserId: string, deviceId: string) {
    if (!this.appNsp || !this.webNsp) return;
    const room = this.userRoom(ownerUserId);
    const payload = { deviceId };
    this.appNsp.to(room).emit("device:invites:updated", payload);
    this.webNsp.to(room).emit("device:invites:updated", payload);
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private deviceRoom(hwid: string) {
    return `device:${hwid}`;
  }

  private attachDevice(device: AppDevice) {
    this.appSocketsByHwid.set(device.hwid, device.socketId);
    const byHwid = this.devicesByUser.get(device.userId) ?? new Map<string, AppDevice>();
    byHwid.set(device.hwid, device);
    this.devicesByUser.set(device.userId, byHwid);
  }

  private detachDevice(userId: string, hwid: string, socketId: string) {
    const byHwid = this.devicesByUser.get(userId);
    if (!byHwid) return;
    const current = byHwid.get(hwid);
    if (!current) return;
    if (current.socketId !== socketId) return;

    byHwid.delete(hwid);
    if (byHwid.size === 0) this.devicesByUser.delete(userId);
    if (this.appSocketsByHwid.get(hwid) === socketId) this.appSocketsByHwid.delete(hwid);
    this.emitDeviceStatusUpdate(userId, current.deviceId);
  }

  private async emitDeviceStatusUpdate(ownerUserId: string, deviceId: string) {
    if (!this.appNsp || !this.webNsp) return;
    const payload = { deviceId };
    const rooms = new Set<string>([this.userRoom(ownerUserId)]);
    try {
      const [friends, sessions] = await Promise.all([
        this.database.listFriends(ownerUserId),
        this.database.listDeviceSessions(deviceId, ownerUserId),
      ]);
      friends.forEach((friend) => rooms.add(this.userRoom(friend.id)));
      sessions.forEach((session) => rooms.add(this.userRoom(session.userId)));
    } catch {
      // ignore
    }
    rooms.forEach((room) => {
      this.appNsp?.to(room).emit("devices:updated", payload);
      this.webNsp?.to(room).emit("devices:updated", payload);
    });
  }

  private emitConnectionsList(webNsp: ReturnType<SocketIOServer["of"]>, userId: string, targetSocket?: Socket) {
    const byHwid = this.devicesByUser.get(userId);
    const devices = byHwid
      ? Array.from(byHwid.values()).map((d) => ({
          hwid: d.hwid,
          name: d.name,
          connectedAt: new Date(d.connectedAt).toISOString(),
        }))
      : [];

    const payload = { devices };
    if (targetSocket) {
      targetSocket.emit("connections:list", payload);
      return;
    }
    webNsp.to(this.userRoom(userId)).emit("connections:list", payload);
  }

  private registerConnectedUser(deviceId: string, userId: string, socketId: string) {
    const byUser = this.connectedUsersByDevice.get(deviceId) ?? new Map<string, { socketId: string; connectedAt: number }>();
    if (!byUser.has(userId)) {
      byUser.set(userId, { socketId, connectedAt: Date.now() });
    }
    this.connectedUsersByDevice.set(deviceId, byUser);
    void this.emitDeviceConnectionsUpdated(deviceId);
  }

  private unregisterConnectedUser(deviceId: string, userId: string, socketId: string) {
    const byUser = this.connectedUsersByDevice.get(deviceId);
    if (!byUser) return;
    const current = byUser.get(userId);
    if (!current) return;
    if (current.socketId !== socketId) return;
    byUser.delete(userId);
    if (byUser.size === 0) {
      this.connectedUsersByDevice.delete(deviceId);
    }
    void this.emitDeviceConnectionsUpdated(deviceId);
  }

  private async canAccessDevice(userId: string, hwid: string): Promise<{ ok: boolean; error?: string; deviceId?: string }> {
    // Access via owner in memory
    const ownerDevice = this.devicesByUser.get(userId)?.get(hwid);
    if (ownerDevice) {
      return { ok: true, deviceId: ownerDevice.deviceId };
    }
    const device = await this.database.getDeviceByHwid(hwid);
    if (!device) return { ok: false, error: "Device not found." };
    if (device.ownerUserId === userId) return { ok: true, deviceId: device.id };
    const activeSessions = await this.database.listActiveSessionsForUser(userId);
    const allowed = activeSessions.some((session) => session.deviceId === device.id);
    if (!allowed) return { ok: false, error: "Access not granted." };
    return { ok: true, deviceId: device.id };
  }

  async listConnectedUsers(deviceId: string): Promise<Array<{ userId: string; connectedAt: string }>> {
    const byUser = this.connectedUsersByDevice.get(deviceId);
    if (!byUser) return [];
    const stale: string[] = [];
    for (const [userId, entry] of byUser.entries()) {
      if (!this.webNsp?.sockets.get(entry.socketId)) {
        stale.push(userId);
      }
    }
    if (stale.length) {
      stale.forEach((userId) => byUser.delete(userId));
      if (byUser.size === 0) this.connectedUsersByDevice.delete(deviceId);
      void this.emitDeviceConnectionsUpdated(deviceId);
    }
    return Array.from(byUser.entries()).map(([userId, data]) => ({
      userId,
      connectedAt: new Date(data.connectedAt).toISOString(),
    }));
  }

  disconnectUserFromDevice(deviceId: string, userId: string): boolean {
    if (!this.webNsp) return false;
    const byUser = this.connectedUsersByDevice.get(deviceId);
    if (!byUser) return false;
    const entry = byUser.get(userId);
    if (!entry) return false;
    byUser.delete(userId);
    if (byUser.size === 0) this.connectedUsersByDevice.delete(deviceId);
    const socket = this.webNsp.sockets.get(entry.socketId);
    if (socket) {
      void (async () => {
        const device = await this.database.getDeviceById(deviceId);
        if (device?.hwid) {
          socket.leave(this.deviceRoom(device.hwid));
        }
      })();
    }
    void this.emitDeviceConnectionsUpdated(deviceId);
    return true;
  }

  private async emitDeviceConnectionsUpdated(deviceId: string) {
    if (!this.appNsp || !this.webNsp) return;
    const device = await this.database.getDeviceById(deviceId);
    if (!device) return;
    const payload = { deviceId };
    this.appNsp.to(this.userRoom(device.ownerUserId)).emit("device:connections:updated", payload);
    this.webNsp.to(this.userRoom(device.ownerUserId)).emit("device:connections:updated", payload);
  }

  isDeviceOnline(hwid: string): boolean {
    return this.appSocketsByHwid.has(hwid);
  }
}
