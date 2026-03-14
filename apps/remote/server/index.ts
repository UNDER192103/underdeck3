import dotenv from "dotenv";

dotenv.config();

import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import express, { NextFunction, Request, Response } from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import multer from "multer";
import sharp from "sharp";
import { createServer } from "http";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { DatabaseService, UserProfile, UserTag } from "./database.js";
import { S3Service } from "./s3.js";
import { RemoteSocketService } from "./socketio.js";
import { fileURLToPath } from "url";
import path from "path";

declare module "express-session" {
    interface SessionData {
        userId?: string;
    }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;
const MAX_AVATAR_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_BANNER_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_AVATAR_MIMES = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
]);
const ALLOWED_BANNER_MIMES = new Set(ALLOWED_AVATAR_MIMES);
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const GIF_PROCESS_MAX_FRAMES = 240;

const INVITE_DURATION_OPTIONS: Record<string, number | null> = {
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "forever": null,
};

function createPasswordHash(password: string) {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    return { salt, hash };
}

function verifyPassword(password: string, salt: string, storedHash: string) {
    const candidate = scryptSync(password, salt, 64);
    const stored = Buffer.from(storedHash, "hex");
    return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

function parseNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function generateNumericId() {
    const timePart = String(Date.now());
    const randomPart = Math.floor(Math.random() * 1e5).toString().padStart(5, "0");
    return `${timePart}${randomPart}`.slice(0, 18);
}

function sanitizeUser(user: {
    id: string;
    displayName: string;
    username: string;
    email: string;
    description: string;
    profileNote: string;
    avatarUrl: string | null;
    bannerUrl: string | null;
    profileBannerColor: string;
    premium: boolean;
    profileGradientTop: string;
    profileGradientBottom: string;
    tags?: UserTag[];
}) {
    return {
        id: user.id,
        displayName: user.displayName,
        username: user.username,
        email: user.email,
        description: user.description || "",
        profileNote: user.profileNote || "",
        avatarUrl: user.avatarUrl ?? null,
        bannerUrl: user.bannerUrl ?? null,
        profileBannerColor: user.profileBannerColor || "#1f2937",
        premium: Boolean(user.premium),
        profileGradientTop: user.profileGradientTop || "#1d4ed8",
        profileGradientBottom: user.profileGradientBottom || "#0f172a",
        tags: Array.isArray(user.tags) ? user.tags : [],
    };
}

async function startServer() {
    const database = new DatabaseService();
    const s3 = new S3Service();
    await database.connect();

    const app = express();
    const httpServer = createServer(app);
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: MAX_AVATAR_SIZE_BYTES },
    });
    const uploadBanner = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: MAX_BANNER_SIZE_BYTES },
    });

    app.use(bodyParser.json());
    app.use(cookieParser());
    app.set("trust proxy", 1);

    const staticPath =
        process.env.NODE_ENV === "production"
            ? path.resolve(__dirname, "..", "dist")
            : path.resolve(__dirname, "..", "dist");

    app.use(express.static(staticPath));

    const isDev = process.env.NODE_ENV !== "production";
    const allowedOrigin = process.env.CLIENT_ORIGIN || `http://localhost:${process.env.WEB_PORT || 5173}`;

    const isAllowedDevOrigin = (origin: string) => {
        return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
    };

    app.use((req, res, next) => {
        const origin = String(req.headers.origin || "").trim();
        if (origin) {
            if (isDev && isAllowedDevOrigin(origin)) {
                res.setHeader("Access-Control-Allow-Origin", origin);
                res.setHeader("Access-Control-Allow-Credentials", "true");
            } else if (!isDev && origin === allowedOrigin) {
                res.setHeader("Access-Control-Allow-Origin", origin);
                res.setHeader("Access-Control-Allow-Credentials", "true");
            }
            res.setHeader("Vary", "Origin");
        }
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method === "OPTIONS") {
            res.status(204).end();
            return;
        }
        next();
    });

    const sessionMiddleware = session({
        name: "bread_crumbs",
        secret: process.env.SESSION_SECRET || "troque-essa-chave-em-producao",
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            client: database.getMongoClient(),
            dbName: process.env.MONGO_DATABASE,
            collectionName: "_sessions",
            ttl: 60 * 60 * 24 * 7,
        }),
        cookie: {
            secure: process.env.NODE_ENV === "production",
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 7,
        },
    });
    app.use(sessionMiddleware);

    const socketService = new RemoteSocketService(httpServer, sessionMiddleware, database);
    socketService.setup();

    const expireDeviceAccess = async () => {
        const [expiredSessions, expiredInvites] = await Promise.all([
            database.expireDeviceSessions(),
            database.expireDeviceInvites(),
        ]);

        if (expiredSessions.length) {
            const sessionsByOwner = new Map<string, Set<string>>();
            const deviceCache = new Map<string, string | null>();
            for (const session of expiredSessions) {
                socketService.disconnectUserFromDevice(session.deviceId, session.userId);
                let hwid = deviceCache.get(session.deviceId);
                if (hwid === undefined) {
                    const device = await database.getDeviceById(session.deviceId);
                    hwid = device?.hwid ?? null;
                    deviceCache.set(session.deviceId, hwid);
                }
                socketService.emitDeviceAccessResolved(session.userId, {
                    sessionId: session.id,
                    deviceId: session.deviceId,
                    hwid,
                    status: "expired",
                });

                const key = `${session.ownerUserId}:${session.deviceId}`;
                const existing = sessionsByOwner.get(key);
                if (existing) {
                    existing.add(session.deviceId);
                } else {
                    sessionsByOwner.set(key, new Set([session.deviceId]));
                }
            }

            for (const key of sessionsByOwner.keys()) {
                const [ownerUserId, deviceId] = key.split(":");
                socketService.emitDeviceSessionsUpdated(ownerUserId, deviceId);
            }
        }

        if (expiredInvites.length) {
            const invitesByOwner = new Set<string>();
            for (const invite of expiredInvites) {
                invitesByOwner.add(`${invite.ownerUserId}:${invite.deviceId}`);
            }
            for (const key of invitesByOwner) {
                const [ownerUserId, deviceId] = key.split(":");
                socketService.emitDeviceInvitesUpdated(ownerUserId, deviceId);
            }
        }
    };

    setInterval(() => {
        void expireDeviceAccess();
    }, 30_000);

    const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
        if (!req.session.userId) {
            return res.status(401).json({ error: "Não autenticado." });
        }

        const user = await database.findUserById(req.session.userId);
        if (!user) {
            req.session.destroy(() => { });
            return res.status(401).json({ error: "Sessao invalida." });
        }

        res.locals.user = user;
        next();
    };

    const getSocketIdFromRequest = (req: Request) => {
        const raw = req.headers["x-socket-id"];
        return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
    };

    // Rota 1: login (GET estado atual, POST login, DELETE logout)
    app
        .route("/api/auth/login")
        .get(requireAuth, (req, res) => {
            res.status(200).json({
                ...sanitizeUser(res.locals.user),
                sessionId: req.sessionID,
            });
        })
        .post(async (req, res) => {
            const identifier = String(req.body?.identifier ?? "").trim();
            const password = String(req.body?.password ?? "");

            if (!identifier || !password) {
                return res.status(400).json({ error: "Informe usuario/email e senha." });
            }

            const userDoc = await database.findUserAuthByIdentifier(identifier);
            if (!userDoc || !verifyPassword(password, userDoc.passwordSalt, userDoc.passwordHash)) {
                return res.status(401).json({ error: "Credenciais invalidas." });
            }

            req.session.userId = userDoc.id;
            res.status(200).json({
                ...sanitizeUser(userDoc),
                sessionId: req.sessionID,
            });
        })
        .delete((req, res) => {
            req.session.destroy((error) => {
                if (error) {
                    return res.status(500).json({ error: "Falha ao encerrar sessao." });
                }

                res.clearCookie("connect.sid");
                res.status(200).json({ ok: true });
            });
        });

    app.post("/api/auth/forgot-password", (_req, res) => {
        res.status(503).json({ error: "Email reset is not available at the moment." });
    });

    // Rota 2: registro
    app.post("/api/auth/register", async (req, res) => {
        const displayName = String(req.body?.displayName ?? "").trim();
        const username = String(req.body?.username ?? "").trim();
        const email = String(req.body?.email ?? "").trim();
        const password = String(req.body?.password ?? "");
        const confirmPassword = String(req.body?.confirmPassword ?? "");

        if (!displayName || !username || !email || !password || !confirmPassword) {
            return res.status(400).json({ error: "Preencha todos os campos do cadastro." });
        }

        if (!USERNAME_REGEX.test(username)) {
            return res.status(400).json({
                error: "Username invalido. Use 3-32 caracteres: letras, numeros e underscore.",
            });
        }

        if (!email.includes("@")) {
            return res.status(400).json({ error: "Email invalido." });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: "A senha precisa ter ao menos 6 caracteres." });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ error: "Senha e confirmação estao diferentes." });
        }

        if (await database.isUsernameTaken(username)) {
            return res.status(409).json({ error: "Username ja esta em uso." });
        }

        if (await database.isEmailTaken(email)) {
            return res.status(409).json({ error: "Email ja esta em uso." });
        }

        const passwordData = createPasswordHash(password);
        let user: UserProfile | null = null;
        while (!user) {
            const id = generateNumericId();
            try {
                user = await database.createUser({
                    id,
                    displayName,
                    username,
                    email,
                    passwordHash: passwordData.hash,
                    passwordSalt: passwordData.salt,
                });
            } catch (error: any) {
                if (String(error?.code) === "11000") {
                    user = null;
                    continue;
                }
                throw error;
            }
        }

        req.session.userId = user.id;
        res.status(201).json({
            ...sanitizeUser(user),
            sessionId: req.sessionID,
        });
    });

    // Rota 3: avatar
    app.post("/api/auth/avatar", requireAuth, upload.single("file"), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: "Arquivo não enviado." });
        }

        if (!ALLOWED_AVATAR_MIMES.has(req.file.mimetype)) {
            return res.status(415).json({ error: "Formato não suportado. Use PNG, JPG, WEBP ou GIF." });
        }

        const user = res.locals.user as UserProfile | undefined;
        if (!user) {
            return res.status(401).json({ error: "Não autenticado." });
        }

        const uploadResult = await s3.uploadUserAsset({
            userId: user.id,
            type: "avatar",
            fileBuffer: req.file.buffer,
            contentType: req.file.mimetype,
            fileName: req.file.originalname,
        });

        const previousAvatarUrl = user.avatarUrl;
        const updatedUser = await database.updateUserAvatar(user.id, uploadResult.url);

        if (previousAvatarUrl && previousAvatarUrl !== uploadResult.url) {
            try {
                await s3.deleteFileByUrl(previousAvatarUrl);
            } catch (error) {
                console.warn("Falha ao remover avatar antigo do S3:", error);
            }
        }

        const payload = sanitizeUser(updatedUser ?? user);
        socketService.emitUserUpdated(user.id, payload, getSocketIdFromRequest(req));
        res.status(200).json({
            ...payload,
            sessionId: req.sessionID,
        });
    });

    app.delete("/api/auth/avatar", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile | undefined;
        if (!user) {
            return res.status(401).json({ error: "Não autenticado." });
        }

        if (user.avatarUrl) {
            try {
                await s3.deleteFileByUrl(user.avatarUrl);
            } catch (error) {
                console.warn("Falha ao remover avatar no S3:", error);
            }
        }

        const updatedUser = await database.updateUserAvatar(user.id, null);
        const payload = sanitizeUser(updatedUser ?? user);
        socketService.emitUserUpdated(user.id, payload, getSocketIdFromRequest(req));
        res.status(200).json({
            ...payload,
            sessionId: req.sessionID,
        });
    });

    app.post("/api/auth/gif-process", requireAuth, uploadBanner.single("file"), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: "Arquivo não enviado." });
        }

        if (req.file.mimetype !== "image/gif") {
            return res.status(415).json({ error: "Essa rota aceita apenas GIF." });
        }

        const user = res.locals.user as UserProfile | undefined;
        if (!user) {
            return res.status(401).json({ error: "Não autenticado." });
        }

        const target = String(req.body?.target ?? "").toLowerCase();
        if (target !== "avatar" && target !== "banner") {
            return res.status(400).json({ error: "Target invalido. Use avatar ou banner." });
        }

        if (target === "banner" && !user.premium) {
            return res.status(403).json({ error: "Apenas usuarios premium podem usar banner." });
        }

        const x = parseNumber(req.body?.x);
        const y = parseNumber(req.body?.y);
        const width = parseNumber(req.body?.width);
        const height = parseNumber(req.body?.height);
        if (x === null || y === null || width === null || height === null) {
            return res.status(400).json({ error: "Area de recorte invalida." });
        }

        const image = sharp(req.file.buffer, { animated: true, pages: -1, limitInputPixels: false });
        const metadata = await image.metadata();
        if (!metadata.width || !metadata.height) {
            return res.status(400).json({ error: "Não foi possivel ler dimensoes do GIF." });
        }
        const frameCount = metadata.pages ?? 1;
        if (frameCount > GIF_PROCESS_MAX_FRAMES) {
            return res.status(422).json({
                error: `GIF com muitos frames (${frameCount}). Limite: ${GIF_PROCESS_MAX_FRAMES}.`,
            });
        }

        const imgW = metadata.width;
        const imgH = metadata.height;

        const left = Math.max(0, Math.min(Math.floor(x), imgW - 1));
        const top = Math.max(0, Math.min(Math.floor(y), imgH - 1));
        const extractWidth = Math.max(1, Math.min(Math.floor(width), imgW - left));
        const extractHeight = Math.max(1, Math.min(Math.floor(height), imgH - top));

        const outputWidth = target === "avatar" ? 512 : 1500;
        const outputHeight = target === "avatar" ? 512 : 500;

        const outputBuffer = await image
            .extract({
                left,
                top,
                width: extractWidth,
                height: extractHeight,
            })
            .resize(outputWidth, outputHeight, { fit: "fill", kernel: sharp.kernel.nearest })
            .gif({
                effort: 1,
                colours: 128,
                dither: 0,
                reuse: true,
                interFrameMaxError: 8,
                interPaletteMaxError: 8,
            })
            .toBuffer();

        res.setHeader("Content-Type", "image/gif");
        return res.status(200).send(outputBuffer);
    });

    app.post("/api/auth/banner", requireAuth, uploadBanner.single("file"), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: "Arquivo não enviado." });
        }

        if (!ALLOWED_BANNER_MIMES.has(req.file.mimetype)) {
            return res.status(415).json({ error: "Formato não suportado. Use PNG, JPG, WEBP ou GIF." });
        }

        const user = res.locals.user as UserProfile | undefined;
        if (!user) {
            return res.status(401).json({ error: "Não autenticado." });
        }

        if (!user.premium) {
            return res.status(403).json({ error: "Apenas usuarios premium podem usar banner." });
        }

        const uploadResult = await s3.uploadUserAsset({
            userId: user.id,
            type: "banner",
            fileBuffer: req.file.buffer,
            contentType: req.file.mimetype,
            fileName: req.file.originalname,
        });

        const previousBannerUrl = user.bannerUrl;
        const updatedUser = await database.updateUserBanner(user.id, uploadResult.url);

        if (previousBannerUrl && previousBannerUrl !== uploadResult.url) {
            try {
                await s3.deleteFileByUrl(previousBannerUrl);
            } catch (error) {
                console.warn("Falha ao remover banner antigo do S3:", error);
            }
        }

        const payload = sanitizeUser(updatedUser ?? user);
        socketService.emitUserUpdated(user.id, payload, getSocketIdFromRequest(req));
        res.status(200).json({
            ...payload,
            sessionId: req.sessionID,
        });
    });

    app.delete("/api/auth/banner", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile | undefined;
        if (!user) {
            return res.status(401).json({ error: "Não autenticado." });
        }

        if (!user.premium) {
            return res.status(403).json({ error: "Apenas usuarios premium podem usar banner." });
        }

        if (user.bannerUrl) {
            try {
                await s3.deleteFileByUrl(user.bannerUrl);
            } catch (error) {
                console.warn("Falha ao remover banner no S3:", error);
            }
        }

        const updatedUser = await database.updateUserBanner(user.id, null);
        const payload = sanitizeUser(updatedUser ?? user);
        socketService.emitUserUpdated(user.id, payload, getSocketIdFromRequest(req));
        res.status(200).json({
            ...payload,
            sessionId: req.sessionID,
        });
    });

    app.patch("/api/auth/profile", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile | undefined;
        if (!user) {
            return res.status(401).json({ error: "Não autenticado." });
        }

        const displayNameRaw = req.body?.displayName;
        const descriptionRaw = req.body?.description;
        const profileNoteRaw = req.body?.profileNote;
        const topRaw = req.body?.profileGradientTop;
        const bottomRaw = req.body?.profileGradientBottom;
        const bannerColorRaw = req.body?.profileBannerColor;

        const payload: {
            displayName?: string;
            description?: string;
            profileNote?: string;
            profileBannerColor?: string;
            profileGradientTop?: string;
            profileGradientBottom?: string;
        } = {};

        if (typeof displayNameRaw === "string") {
            const displayName = displayNameRaw.trim();
            if (!displayName) {
                return res.status(400).json({ error: "Nome de exibição não pode ser vazio." });
            }
            if (displayName.length > 64) {
                return res.status(400).json({ error: "Nome de exibição muito grande." });
            }
            payload.displayName = displayName;
        }

        if (typeof descriptionRaw === "string") {
            if (descriptionRaw.length > 300) {
                return res.status(400).json({ error: "Descrição muito grande (max 300)." });
            }
            payload.description = descriptionRaw;
        }

        if (typeof profileNoteRaw === "string") {
            if (profileNoteRaw.length > 300) {
                return res.status(400).json({ error: "Nota muito grande (max 300)." });
            }
            payload.profileNote = profileNoteRaw;
        }

        if (typeof topRaw === "string") {
            if (!HEX_COLOR_REGEX.test(topRaw)) {
                return res.status(400).json({ error: "Cor superior invalida. Use formato #RRGGBB." });
            }
            payload.profileGradientTop = topRaw;
        }

        if (typeof bannerColorRaw === "string") {
            if (!HEX_COLOR_REGEX.test(bannerColorRaw)) {
                return res.status(400).json({ error: "Cor do banner invalida. Use formato #RRGGBB." });
            }
            payload.profileBannerColor = bannerColorRaw;
        }

        if (typeof bottomRaw === "string") {
            if (!HEX_COLOR_REGEX.test(bottomRaw)) {
                return res.status(400).json({ error: "Cor inferior invalida. Use formato #RRGGBB." });
            }
            payload.profileGradientBottom = bottomRaw;
        }

        const updatedUser = await database.updateUserProfile(user.id, payload);
        const userPayload = sanitizeUser(updatedUser ?? user);
        socketService.emitUserUpdated(user.id, userPayload, getSocketIdFromRequest(req));
        res.status(200).json({
            ...userPayload,
            sessionId: req.sessionID,
        });
    });

    app.get("/api/friends", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile;
        const friends = await database.listFriends(user.id);
        const requests = await database.listFriendRequests(user.id);
        res.status(200).json({
            friends: friends.map(sanitizeUser),
            requests: {
                incoming: requests.incoming.map((req) => ({
                    id: req.id,
                    fromUserId: req.fromUserId,
                    createdAt: req.createdAt,
                    fromUser: req.fromUser ? sanitizeUser(req.fromUser) : null,
                })),
                outgoing: requests.outgoing.map((req) => ({
                    id: req.id,
                    toUserId: req.toUserId,
                    createdAt: req.createdAt,
                    toUser: req.toUser ? sanitizeUser(req.toUser) : null,
                })),
            },
        });
    });

    app.post("/api/friends/requests", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile;
        const raw = String(req.body?.identifier ?? req.body?.userId ?? req.body?.username ?? "").trim();
        if (!raw) {
            return res.status(400).json({ error: "Informe o ID ou username." });
        }

        const targetById = await database.findUserById(raw);
        const targetByUsername = targetById ? null : await database.findUserByUsername(raw);
        const target = targetById ?? targetByUsername;
        if (!target) {
            return res.status(404).json({ error: "Usuario nao encontrado." });
        }
        if (target.id === user.id) {
            return res.status(400).json({ error: "Voce nao pode adicionar a si mesmo." });
        }

        if (await database.areFriends(user.id, target.id)) {
            return res.status(409).json({ error: "Vocês ja sao amigos." });
        }

        if (await database.hasPendingFriendRequest(user.id, target.id)) {
            return res.status(409).json({ error: "Solicitacao ja enviada." });
        }

        const request = await database.createFriendRequest({
            id: uuidv4(),
            fromUserId: user.id,
            toUserId: target.id,
        });

        socketService.emitFriendRequest(target.id, {
            id: request.id,
            fromUser: sanitizeUser(user),
            createdAt: request.createdAt,
        });
        socketService.emitFriendsUpdated(user.id);
        socketService.emitFriendsUpdated(target.id);

        res.status(201).json({ ok: true, requestId: request.id });
    });

    app.post("/api/friends/requests/:id/accept", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile;
        const requestId = String(req.params.id || "").trim();
        if (!requestId) {
            return res.status(400).json({ error: "Request invalido." });
        }
        const accepted = await database.acceptFriendRequest(requestId, user.id);
        if (!accepted) {
            return res.status(404).json({ error: "Solicitacao nao encontrada." });
        }
        socketService.emitFriendsUpdated(user.id);
        socketService.emitFriendsUpdated(accepted.fromUserId);
        res.status(200).json({ ok: true });
    });

    app.post("/api/friends/requests/:id/decline", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile;
        const requestId = String(req.params.id || "").trim();
        if (!requestId) {
            return res.status(400).json({ error: "Request invalido." });
        }
        const declined = await database.rejectFriendRequest(requestId, user.id);
        if (!declined) {
            return res.status(404).json({ error: "Solicitacao nao encontrada." });
        }
        socketService.emitFriendsUpdated(user.id);
        socketService.emitFriendsUpdated(declined.fromUserId);
        res.status(200).json({ ok: true });
    });

    app.get("/api/devices", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile;
        const friends = await database.listFriends(user.id);
        const friendIds = friends.map((f) => f.id);
        const [ownDevices, friendDevices, sessions] = await Promise.all([
            database.listDevicesByOwner(user.id),
            database.listDevicesByOwners(friendIds),
            database.listActiveSessionsForUser(user.id),
        ]);

        const sessionByDevice = new Map(sessions.map((s) => [s.deviceId, s]));
        const devices = [...ownDevices, ...friendDevices].reduce((acc, device) => {
            acc.set(device.id, device);
            return acc;
        }, new Map<string, typeof ownDevices[number]>());

        // Include devices from active sessions (may not be friends)
        for (const session of sessions) {
            const device = await database.getDeviceById(session.deviceId);
            if (device) devices.set(device.id, device);
        }

        const ownerIds = Array.from(new Set(Array.from(devices.values()).map((d) => d.ownerUserId)));
        const owners = await database.listUsersByIds(ownerIds);
        const ownerById = new Map(owners.map((o) => [o.id, o]));

        const payload = Array.from(devices.values()).map((device) => {
            const owner = ownerById.get(device.ownerUserId);
            const session = sessionByDevice.get(device.id) || null;
            return {
                id: device.id,
                name: device.name,
                ownerId: device.ownerUserId,
                owner: owner ? sanitizeUser(owner) : null,
                isOwner: device.ownerUserId === user.id,
                isFriendOwner: friendIds.includes(device.ownerUserId),
                hasSession: Boolean(session),
                sessionExpiresAt: session?.expiresAt ?? null,
                online: socketService.isDeviceOnline(device.hwid),
                lastSeenAt: device.lastSeenAt,
                hwid: device.hwid,
            };
        });

        res.status(200).json({ devices: payload });
    });

    app.get("/api/devices/:id/invites", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile;
        const deviceId = String(req.params.id || "").trim();
        const device = await database.getDeviceById(deviceId);
        if (!device || device.ownerUserId !== user.id) {
            return res.status(404).json({ error: "Dispositivo nao encontrado." });
        }
        const invites = await database.listDeviceInvites(deviceId, user.id);
        res.status(200).json({ invites });
    });

    app.post("/api/devices/:id/invites", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile;
        const deviceId = String(req.params.id || "").trim();
        const duration = String(req.body?.duration || "").trim();
        const device = await database.getDeviceById(deviceId);
        if (!device || device.ownerUserId !== user.id) {
            return res.status(404).json({ error: "Dispositivo nao encontrado." });
        }

        const limit = await database.countActiveInvites(deviceId, user.id);
        if (limit >= 5) {
            return res.status(409).json({ error: "Limite de convites ativos atingido." });
        }

        if (!(duration in INVITE_DURATION_OPTIONS)) {
            return res.status(400).json({ error: "Duracao invalida." });
        }

        const now = Date.now();
        const durationMs = INVITE_DURATION_OPTIONS[duration];
        const expiresAt = durationMs === null ? null : new Date(now + durationMs);
        const invite = await database.createDeviceInvite({
            id: uuidv4(),
            deviceId,
            ownerUserId: user.id,
            token: randomBytes(18).toString("hex"),
            expiresAt,
        });

        socketService.emitDeviceInvitesUpdated(user.id, deviceId);
        res.status(201).json({ invite });
    });

    app.delete("/api/devices/:id/invites/:inviteId", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile;
        const deviceId = String(req.params.id || "").trim();
        const inviteId = String(req.params.inviteId || "").trim();
        const device = await database.getDeviceById(deviceId);
        if (!device || device.ownerUserId !== user.id) {
            return res.status(404).json({ error: "Dispositivo nao encontrado." });
        }
        const revoked = await database.revokeDeviceInvite(inviteId, user.id);
        if (!revoked) {
            return res.status(404).json({ error: "Convite nao encontrado." });
        }
        socketService.emitDeviceInvitesUpdated(user.id, deviceId);
        res.status(200).json({ ok: true });
    });

    app.post("/api/device-access/request", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile;
        const token = String(req.body?.token || "").trim();
        if (!token) {
            return res.status(400).json({ error: "Token invalido." });
        }
        const invite = await database.getInviteByToken(token);
        if (!invite) {
            return res.status(404).json({ error: "Convite nao encontrado." });
        }
        if (invite.expiresAt && invite.expiresAt <= new Date()) {
            return res.status(410).json({ error: "Convite expirado." });
        }
        const device = await database.getDeviceById(invite.deviceId);
        if (!device) {
            return res.status(404).json({ error: "Dispositivo nao encontrado." });
        }
        if (device.ownerUserId === user.id) {
            return res.status(200).json({
                ok: true,
                status: "owner",
                deviceId: device.id,
                deviceName: device.name,
                hwid: device.hwid,
            });
        }

        const activeSessions = await database.listActiveSessionsForUser(user.id);
        const existing = activeSessions.find((s) => s.deviceId === device.id);
        if (existing) {
            return res.status(200).json({
                ok: true,
                status: existing.status,
                sessionId: existing.id,
                deviceId: device.id,
                deviceName: device.name,
                hwid: device.hwid,
            });
        }

        const expiresAt = invite.expiresAt ? new Date(invite.expiresAt) : null;
        const session = await database.createDeviceSession({
            id: uuidv4(),
            deviceId: device.id,
            ownerUserId: device.ownerUserId,
            userId: user.id,
            status: "pending",
            expiresAt,
        });

        socketService.emitDeviceAccessRequest(device.ownerUserId, {
            sessionId: session.id,
            deviceId: device.id,
            deviceName: device.name,
            requester: sanitizeUser(user),
            expiresAt: session.expiresAt,
        });
        socketService.emitDeviceSessionsUpdated(device.ownerUserId, device.id);
        res.status(201).json({
            ok: true,
            status: "pending",
            sessionId: session.id,
            deviceId: device.id,
            deviceName: device.name,
            hwid: device.hwid,
        });
      });

    app.get("/api/devices/:id/sessions", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile;
        const deviceId = String(req.params.id || "").trim();
        const device = await database.getDeviceById(deviceId);
        if (!device || device.ownerUserId !== user.id) {
            return res.status(404).json({ error: "Dispositivo nao encontrado." });
        }
        const sessions = await database.listDeviceSessions(deviceId, user.id);
        const users = await database.listUsersByIds(sessions.map((s) => s.userId));
        const byId = new Map(users.map((u) => [u.id, u]));
        res.status(200).json({
            sessions: sessions.map((s) => ({
                ...s,
                user: byId.get(s.userId) ? sanitizeUser(byId.get(s.userId)!) : null,
            })),
        });
    });

    app.get("/api/devices/:id/connections", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile;
        const deviceId = String(req.params.id || "").trim();
        const device = await database.getDeviceById(deviceId);
        if (!device || device.ownerUserId !== user.id) {
            return res.status(404).json({ error: "Dispositivo nao encontrado." });
        }
        const connections = await socketService.listConnectedUsers(deviceId);
        const users = await database.listUsersByIds(connections.map((c) => c.userId));
        const byId = new Map(users.map((u) => [u.id, u]));
        res.status(200).json({
            connections: connections.map((c) => ({
                ...c,
                user: byId.get(c.userId) ? sanitizeUser(byId.get(c.userId)!) : null,
            })),
        });
    });

    app.post("/api/devices/:id/connections/:userId/disconnect", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile;
        const deviceId = String(req.params.id || "").trim();
        const targetUserId = String(req.params.userId || "").trim();
        const device = await database.getDeviceById(deviceId);
        if (!device || device.ownerUserId !== user.id) {
            return res.status(404).json({ error: "Dispositivo nao encontrado." });
        }
        if (!targetUserId) {
            return res.status(400).json({ error: "Usuario invalido." });
        }
        const ok = socketService.disconnectUserFromDevice(deviceId, targetUserId);
        if (!ok) {
            await socketService.listConnectedUsers(deviceId);
        }
        res.status(200).json({ ok: true });
    });

    app.post("/api/devices/:id/sessions/:sessionId/approve", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile;
        const deviceId = String(req.params.id || "").trim();
        const sessionId = String(req.params.sessionId || "").trim();
        const device = await database.getDeviceById(deviceId);
        if (!device || device.ownerUserId !== user.id) {
            return res.status(404).json({ error: "Dispositivo nao encontrado." });
        }
        const session = await database.updateDeviceSessionStatus({ id: sessionId, ownerUserId: user.id, status: "active" });
        if (!session) {
            return res.status(404).json({ error: "Sessao nao encontrada." });
        }
        socketService.emitDeviceAccessResolved(session.userId, { sessionId, deviceId, hwid: device.hwid, status: "approved" });
        socketService.emitDeviceSessionsUpdated(user.id, deviceId);
        res.status(200).json({ ok: true });
    });

    app.post("/api/devices/:id/sessions/:sessionId/deny", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile;
        const deviceId = String(req.params.id || "").trim();
        const sessionId = String(req.params.sessionId || "").trim();
        const device = await database.getDeviceById(deviceId);
        if (!device || device.ownerUserId !== user.id) {
            return res.status(404).json({ error: "Dispositivo nao encontrado." });
        }
        const session = await database.updateDeviceSessionStatus({ id: sessionId, ownerUserId: user.id, status: "denied" });
        if (!session) {
            return res.status(404).json({ error: "Sessao nao encontrada." });
        }
        socketService.disconnectUserFromDevice(deviceId, session.userId);
        socketService.emitDeviceAccessResolved(session.userId, { sessionId, deviceId, hwid: device.hwid, status: "denied" });
        socketService.emitDeviceSessionsUpdated(user.id, deviceId);
        res.status(200).json({ ok: true });
    });

    app.delete("/api/devices/:id/sessions/:sessionId", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile;
        const deviceId = String(req.params.id || "").trim();
        const sessionId = String(req.params.sessionId || "").trim();
        const device = await database.getDeviceById(deviceId);
        if (!device || device.ownerUserId !== user.id) {
            return res.status(404).json({ error: "Dispositivo nao encontrado." });
        }
        const session = await database.revokeDeviceSession(sessionId, user.id);
        if (!session) {
            return res.status(404).json({ error: "Sessao nao encontrada." });
        }
        socketService.disconnectUserFromDevice(deviceId, session.userId);
        socketService.emitDeviceAccessResolved(session.userId, { sessionId, deviceId, hwid: device.hwid, status: "revoked" });
        socketService.emitDeviceSessionsUpdated(user.id, deviceId);
        res.status(200).json({ ok: true });
    });

    app.delete("/api/friends/:id", requireAuth, async (req, res) => {
        const user = res.locals.user as UserProfile;
        const friendId = String(req.params.id || "").trim();
        if (!friendId) {
            return res.status(400).json({ error: "Friend invalido." });
        }
        if (friendId === user.id) {
            return res.status(400).json({ error: "Voce nao pode remover a si mesmo." });
        }
        const removed = await database.removeFriend(user.id, friendId);
        if (!removed) {
            return res.status(404).json({ error: "Amizade nao encontrada." });
        }
        socketService.emitFriendsUpdated(user.id);
        socketService.emitFriendsUpdated(friendId);
        res.status(200).json({ ok: true });
    });

    app.get('/api/store/items/:type', async (req, res) => {
        const type = req.params.type && !isNaN(Number(req.params.type)) ? Number(req.params.type) : undefined;
        res.status(200).json(await database.listItemsStore(type));
    });

    app.get("*", (_req, res) => {
        res.sendFile(path.join(staticPath, "index.html"));
    });

    const port = Number(process.env.SERVER_PORT || 6000);
    httpServer.listen(port, () => {
        console.log(`API e Socket.IO ativos em http://localhost:${port}`);
    });
}

startServer().catch((error) => {
    console.error(error);
    process.exit(1);
});
