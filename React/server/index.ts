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
import { SocketSessionService } from "./socketio.js";

declare module "express-session" {
    interface SessionData {
        userId?: string;
    }
}

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

    const socketService = new SocketSessionService(httpServer, sessionMiddleware);
    socketService.setup();

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
        const user = await database.createUser({
            id: uuidv4(),
            displayName,
            username,
            email,
            passwordHash: passwordData.hash,
            passwordSalt: passwordData.salt,
        });

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

        res.status(200).json({
            ...sanitizeUser(updatedUser ?? user),
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
        res.status(200).json({
            ...sanitizeUser(updatedUser ?? user),
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

        res.status(200).json({
            ...sanitizeUser(updatedUser ?? user),
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
        res.status(200).json({
            ...sanitizeUser(updatedUser ?? user),
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
        res.status(200).json({
            ...sanitizeUser(updatedUser ?? user),
            sessionId: req.sessionID,
        });
    });

    app.get('/api/store/items/:type', async (req, res) => {
        const type = req.params.type && !isNaN(Number(req.params.type)) ? Number(req.params.type) : undefined;
        res.status(200).json(await database.listItemsStore(type));
    })

    const port = Number(process.env.SERVER_PORT || 6000);
    httpServer.listen(port, () => {
        console.log(`API e Socket.IO ativos em http://localhost:${port}`);
    });
}

startServer().catch((error) => {
    console.error(error);
    process.exit(1);
});
