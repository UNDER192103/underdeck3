// server/index.ts
import dotenv3 from "dotenv";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import multer from "multer";
import sharp from "sharp";
import { createServer } from "http";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { v4 as uuidv43 } from "uuid";

// server/database.ts
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
dotenv.config();
var DatabaseService = class {
  mongoUri;
  mongoDatabase;
  client;
  db;
  constructor() {
    const mongoUri = process.env.MONGO_URI;
    const mongoDatabase = process.env.MONGO_DATABASE;
    if (!mongoUri || !mongoDatabase) {
      console.error("Faltando variaveis de ambiente do MongoDB. Defina MONGO_URI e MONGO_DATABASE.");
      process.exit(1);
    }
    this.mongoUri = mongoUri;
    this.mongoDatabase = mongoDatabase;
    this.client = new MongoClient(this.mongoUri);
  }
  async connect() {
    try {
      await this.client.connect();
      this.db = this.client.db(this.mongoDatabase);
      await this.ensureIndexes();
      console.log("Conectado com sucesso ao MongoDB.");
    } catch (error) {
      console.error("N\xE3o foi possivel conectar ao MongoDB", error);
      process.exit(1);
    }
  }
  getMongoClient() {
    return this.client;
  }
  async createUser(input) {
    const now = /* @__PURE__ */ new Date();
    const doc = {
      id: input.id,
      displayName: input.displayName.trim(),
      username: input.username.trim(),
      usernameNormalized: input.username.trim().toLowerCase(),
      email: input.email.trim(),
      emailNormalized: input.email.trim().toLowerCase(),
      description: "",
      profileNote: "",
      avatarUrl: null,
      bannerUrl: null,
      profileBannerColor: "#1f2937",
      premium: false,
      profileGradientTop: "#1d4ed8",
      profileGradientBottom: "#0f172a",
      tags: [],
      passwordHash: input.passwordHash,
      passwordSalt: input.passwordSalt,
      createdAt: now,
      updatedAt: now
    };
    await this.getUsersCollection().insertOne(doc);
    return this.toUserProfile(doc);
  }
  async findUserById(id) {
    const doc = await this.getUsersCollection().findOne({ id });
    return doc ? this.toUserProfile(doc) : null;
  }
  async findUserAuthByIdentifier(identifier) {
    const normalized = identifier.trim().toLowerCase();
    return this.getUsersCollection().findOne({
      $or: [{ usernameNormalized: normalized }, { emailNormalized: normalized }]
    });
  }
  async isUsernameTaken(username) {
    const count = await this.getUsersCollection().countDocuments({
      usernameNormalized: username.trim().toLowerCase()
    });
    return count > 0;
  }
  async isEmailTaken(email) {
    const count = await this.getUsersCollection().countDocuments({
      emailNormalized: email.trim().toLowerCase()
    });
    return count > 0;
  }
  async updateUserAvatar(userId, avatarUrl) {
    const now = /* @__PURE__ */ new Date();
    const result = await this.getUsersCollection().findOneAndUpdate(
      { id: userId },
      { $set: { avatarUrl, updatedAt: now } },
      { returnDocument: "after" }
    );
    return result ? this.toUserProfile(result) : null;
  }
  async updateUserBanner(userId, bannerUrl) {
    const now = /* @__PURE__ */ new Date();
    const result = await this.getUsersCollection().findOneAndUpdate(
      { id: userId },
      { $set: { bannerUrl, updatedAt: now } },
      { returnDocument: "after" }
    );
    return result ? this.toUserProfile(result) : null;
  }
  async updateUserProfile(userId, payload) {
    const now = /* @__PURE__ */ new Date();
    const updates = {
      updatedAt: now
    };
    if (typeof payload.displayName === "string") {
      updates.displayName = payload.displayName.trim();
    }
    if (typeof payload.description === "string") {
      updates.description = payload.description.trim();
    }
    if (typeof payload.profileNote === "string") {
      updates.profileNote = payload.profileNote.trim();
    }
    if (typeof payload.profileGradientTop === "string") {
      updates.profileGradientTop = payload.profileGradientTop;
    }
    if (typeof payload.profileBannerColor === "string") {
      updates.profileBannerColor = payload.profileBannerColor;
    }
    if (typeof payload.profileGradientBottom === "string") {
      updates.profileGradientBottom = payload.profileGradientBottom;
    }
    const result = await this.getUsersCollection().findOneAndUpdate(
      { id: userId },
      { $set: updates },
      { returnDocument: "after" }
    );
    return result ? this.toUserProfile(result) : null;
  }
  async listItemsStore(type) {
    if (type) {
      const items2 = await this.getStoreCollection().find({ type }).toArray();
      return items2;
    }
    const items = await this.getStoreCollection().find().toArray();
    return items;
  }
  toUserProfile(doc) {
    return {
      id: doc.id,
      displayName: doc.displayName,
      username: doc.username,
      email: doc.email,
      description: doc.description || "",
      profileNote: doc.profileNote || "",
      avatarUrl: doc.avatarUrl ?? null,
      bannerUrl: doc.bannerUrl ?? null,
      profileBannerColor: doc.profileBannerColor || "#1f2937",
      premium: Boolean(doc.premium),
      profileGradientTop: doc.profileGradientTop || "#1d4ed8",
      profileGradientBottom: doc.profileGradientBottom || "#0f172a",
      tags: this.normalizeTags(doc.tags),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  }
  normalizeTags(tags) {
    if (!Array.isArray(tags)) {
      return [];
    }
    return tags.filter((tag) => tag && typeof tag.name === "string" && tag.name.trim().length > 0).map((tag) => ({
      name: tag.name.trim(),
      icon: typeof tag.icon === "string" ? tag.icon : null,
      description: typeof tag.description === "string" ? tag.description : "",
      meta_data: tag.meta_data
    }));
  }
  getDb() {
    if (!this.db) {
      throw new Error("Banco de dados ainda n\xE3o inicializado. Chame connect() primeiro.");
    }
    return this.db;
  }
  getUsersCollection() {
    return this.getDb().collection("users");
  }
  getStoreCollection() {
    return this.getDb().collection("store");
  }
  async ensureIndexes() {
    const users = this.getUsersCollection();
    await Promise.all([
      users.createIndex({ id: 1 }, { unique: true }),
      users.createIndex({ usernameNormalized: 1 }, { unique: true }),
      users.createIndex({ emailNormalized: 1 }, { unique: true })
    ]);
  }
};

// server/s3.ts
import dotenv2 from "dotenv";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
dotenv2.config();
var S3Service = class {
  endpoint;
  endpointType;
  region;
  bucket;
  client;
  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    const endpointType = process.env.S3_ENDPOINT_TYPE;
    const region = process.env.S3_REGION;
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;
    const bucket = process.env.S3_bucket;
    if (!endpoint || !endpointType || !region || !accessKeyId || !secretAccessKey || !bucket) {
      console.error(
        "Faltando variaveis de ambiente do S3. Defina S3_ENDPOINT, S3_ENDPOINT_TYPE, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY e S3_bucket."
      );
      process.exit(1);
    }
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.endpointType = endpointType.toUpperCase();
    this.region = region;
    this.bucket = bucket;
    this.client = new S3Client({
      endpoint: this.endpoint,
      region: this.region,
      forcePathStyle: this.endpointType === "PATH",
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    });
  }
  async uploadUserAsset({
    userId,
    type,
    fileBuffer,
    contentType,
    fileName
  }) {
    const extension = path.extname(fileName) || "";
    const key = `users/${userId}/${type}/${Date.now()}-${uuidv4()}${extension}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType
      })
    );
    return {
      key,
      url: this.buildFileUrl(key)
    };
  }
  async deleteFileByUrl(fileUrl) {
    if (!fileUrl) return;
    const key = this.extractKeyFromUrl(fileUrl);
    if (!key) return;
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key
      })
    );
  }
  buildFileUrl(key) {
    if (this.endpointType === "PATH") {
      return `${this.endpoint}/${this.bucket}/${key}`;
    }
    const parsed = new URL(this.endpoint);
    return `${parsed.protocol}//${this.bucket}.${parsed.host}/${key}`;
  }
  extractKeyFromUrl(fileUrl) {
    try {
      const parsed = new URL(fileUrl);
      const pathname = parsed.pathname.replace(/^\/+/, "");
      if (!pathname) return null;
      if (this.endpointType === "PATH") {
        const bucketPrefix = `${this.bucket}/`;
        return pathname.startsWith(bucketPrefix) ? pathname.slice(bucketPrefix.length) : null;
      }
      return pathname;
    } catch {
      return null;
    }
  }
};

// server/socketio.ts
import { Server as SocketIOServer } from "socket.io";
import { v4 as uuidv42 } from "uuid";
var SocketSessionService = class {
  io;
  connectedSocketsByUserId = /* @__PURE__ */ new Map();
  sessions = /* @__PURE__ */ new Map();
  pendingInvites = /* @__PURE__ */ new Map();
  pendingCommands = /* @__PURE__ */ new Map();
  constructor(server, sessionMiddleware) {
    const clientOrigin = process.env.CLIENT_ORIGIN || `http://localhost:${process.env.WEB_PORT || 5173}`;
    this.io = new SocketIOServer(server, {
      cors: {
        origin: clientOrigin,
        methods: ["GET", "POST"],
        credentials: true
      }
    });
    this.io.engine.use((req, res, next) => {
      sessionMiddleware(req, res, next);
    });
  }
  setup() {
    this.io.on("connection", (socket) => {
      const authedSocket = socket;
      authedSocket.data.isAuthenticated = false;
      authedSocket.data.userId = void 0;
      const unauthenticateSocket = () => {
        const currentUserId = authedSocket.data.userId;
        if (currentUserId) {
          this.detachSocketFromUser(socket.id, currentUserId);
          socket.leave(this.getUserRoom(currentUserId));
        }
        authedSocket.data.isAuthenticated = false;
        authedSocket.data.userId = void 0;
      };
      console.log(`[Socket.IO] Cliente conectado: ${socket.id}`);
      socket.on(
        "auth_app",
        (payload, callback) => {
          const userId = payload?.userId?.trim();
          const sessionId = payload?.sessionId?.trim();
          const req = socket.request;
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
            callback?.({ ok: false, authenticated: false, error: "Falha de valida\xE7\xE3o da sessao no socket." });
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
        }
      );
      socket.on(
        "session:create",
        (payload, callback) => {
          const userId = authedSocket.data.userId;
          if (!userId) {
            callback?.({ ok: false, error: "N\xE3o autenticado." });
            return;
          }
          const sessionId = uuidv42();
          const session2 = {
            id: sessionId,
            ownerUserId: userId,
            name: payload?.name?.trim() || void 0,
            createdAt: /* @__PURE__ */ new Date(),
            members: /* @__PURE__ */ new Set([userId])
          };
          this.sessions.set(sessionId, session2);
          socket.join(this.getSessionRoom(sessionId));
          this.pushSessionListToUser(userId);
          callback?.({ ok: true, session: { id: sessionId, name: session2.name } });
        }
      );
      socket.on(
        "session:list",
        (callback) => {
          const userId = authedSocket.data.userId;
          if (!userId) {
            callback?.({ ok: false, sessions: [] });
            return;
          }
          callback?.({ ok: true, sessions: this.getUserSessions(userId) });
        }
      );
      socket.on(
        "session:join",
        (payload, callback) => {
          const userId = authedSocket.data.userId;
          if (!userId) {
            callback?.({ ok: false, error: "N\xE3o autenticado." });
            return;
          }
          const session2 = this.sessions.get(payload?.sessionId);
          if (!session2 || !session2.members.has(userId)) {
            callback?.({ ok: false, error: "Sessao n\xE3o encontrada ou acesso negado." });
            return;
          }
          socket.join(this.getSessionRoom(session2.id));
          callback?.({ ok: true });
        }
      );
      socket.on(
        "session:invite:send",
        (payload, callback) => {
          const fromUserId = authedSocket.data.userId;
          if (!fromUserId) {
            callback?.({ ok: false, error: "N\xE3o autenticado." });
            return;
          }
          const toUserId = payload?.toUserId?.trim();
          const session2 = this.sessions.get(payload?.sessionId);
          if (!session2) {
            callback?.({ ok: false, error: "Sessao n\xE3o encontrada." });
            return;
          }
          if (!session2.members.has(fromUserId)) {
            callback?.({ ok: false, error: "Somente membros podem convidar." });
            return;
          }
          if (!toUserId) {
            callback?.({ ok: false, error: "toUserId eh obrigatorio." });
            return;
          }
          if (session2.members.has(toUserId)) {
            callback?.({ ok: false, error: "Usuario ja faz parte da sessao." });
            return;
          }
          const inviteId = uuidv42();
          const invite = {
            inviteId,
            sessionId: session2.id,
            fromUserId,
            toUserId,
            createdAt: /* @__PURE__ */ new Date(),
            status: "pending"
          };
          this.pendingInvites.set(inviteId, invite);
          this.io.to(this.getUserRoom(toUserId)).emit("session:invite:received", {
            inviteId,
            sessionId: session2.id,
            fromUserId,
            toUserId,
            createdAt: invite.createdAt.toISOString()
          });
          callback?.({ ok: true, inviteId });
        }
      );
      socket.on(
        "session:invite:respond",
        (payload, callback) => {
          const userId = authedSocket.data.userId;
          if (!userId) {
            callback?.({ ok: false, error: "N\xE3o autenticado." });
            return;
          }
          const invite = this.pendingInvites.get(payload?.inviteId);
          if (!invite || invite.status !== "pending") {
            callback?.({ ok: false, error: "Convite invalido ou expirado." });
            return;
          }
          if (invite.toUserId !== userId) {
            callback?.({ ok: false, error: "Convite n\xE3o pertence ao usuario." });
            return;
          }
          const session2 = this.sessions.get(invite.sessionId);
          if (!session2) {
            this.pendingInvites.delete(invite.inviteId);
            callback?.({ ok: false, error: "Sessao n\xE3o encontrada." });
            return;
          }
          if (payload.accept) {
            invite.status = "accepted";
            session2.members.add(userId);
            this.joinAllUserSocketsToSession(userId, session2.id);
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
            accepted: payload.accept
          });
          callback?.({ ok: true, sessionId: invite.sessionId });
        }
      );
      socket.on(
        "session:command:response",
        (payload) => {
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
        }
      );
      socket.on("disconnect", () => {
        unauthenticateSocket();
        console.log(`[Socket.IO] Cliente desconectado: ${socket.id}`);
      });
    });
    console.log("[Socket.IO] Servico de sessoes em tempo real iniciado.");
  }
  async sendCommand(input) {
    const session2 = this.sessions.get(input.sessionId);
    if (!session2) {
      throw new Error(`Sessao n\xE3o encontrada: ${input.sessionId}`);
    }
    const shouldAwait = Boolean(input.await);
    const commandId = shouldAwait ? uuidv42() : void 0;
    const commandPayload = {
      ...input.command,
      commandId
    };
    this.io.to(this.getSessionRoom(session2.id)).emit("session:command", commandPayload);
    if (!shouldAwait || !commandId) {
      return { sent: true, commandId: null };
    }
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error(`Timeout aguardando resposta do comando ${commandId}.`));
      }, input.timeoutMs ?? 15e3);
      this.pendingCommands.set(commandId, { resolve, reject, timeoutId });
    });
  }
  getUserRoom(userId) {
    return `user:${userId}`;
  }
  getSessionRoom(sessionId) {
    return `session:${sessionId}`;
  }
  attachSocketToUser(socketId, userId) {
    const socketIds = this.connectedSocketsByUserId.get(userId) ?? /* @__PURE__ */ new Set();
    socketIds.add(socketId);
    this.connectedSocketsByUserId.set(userId, socketIds);
  }
  detachSocketFromUser(socketId, userId) {
    const socketIds = this.connectedSocketsByUserId.get(userId);
    if (!socketIds) {
      return;
    }
    socketIds.delete(socketId);
    if (socketIds.size === 0) {
      this.connectedSocketsByUserId.delete(userId);
    }
  }
  joinAllUserSocketsToSession(userId, sessionId) {
    const socketIds = this.connectedSocketsByUserId.get(userId);
    if (!socketIds) {
      return;
    }
    socketIds.forEach((socketId) => {
      this.io.sockets.sockets.get(socketId)?.join(this.getSessionRoom(sessionId));
    });
  }
  pushSessionListToUser(userId) {
    const sessions = this.getUserSessions(userId);
    this.io.to(this.getUserRoom(userId)).emit("session:list", sessions);
  }
  getUserSessions(userId) {
    return Array.from(this.sessions.values()).filter((session2) => session2.members.has(userId)).map((session2) => ({
      id: session2.id,
      ownerUserId: session2.ownerUserId,
      name: session2.name,
      createdAt: session2.createdAt.toISOString(),
      members: Array.from(session2.members)
    }));
  }
};

// server/index.ts
dotenv3.config();
var USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;
var MAX_AVATAR_SIZE_BYTES = 15 * 1024 * 1024;
var MAX_BANNER_SIZE_BYTES = 20 * 1024 * 1024;
var ALLOWED_AVATAR_MIMES = /* @__PURE__ */ new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif"
]);
var ALLOWED_BANNER_MIMES = new Set(ALLOWED_AVATAR_MIMES);
var HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
var GIF_PROCESS_MAX_FRAMES = 240;
function createPasswordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(password, salt, storedHash) {
  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(storedHash, "hex");
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}
function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function sanitizeUser(user) {
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
    tags: Array.isArray(user.tags) ? user.tags : []
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
    limits: { fileSize: MAX_AVATAR_SIZE_BYTES }
  });
  const uploadBanner = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BANNER_SIZE_BYTES }
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
      ttl: 60 * 60 * 24 * 7
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 1e3 * 60 * 60 * 24 * 7
    }
  });
  app.use(sessionMiddleware);
  const socketService = new SocketSessionService(httpServer, sessionMiddleware);
  socketService.setup();
  const requireAuth = async (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "N\xE3o autenticado." });
    }
    const user = await database.findUserById(req.session.userId);
    if (!user) {
      req.session.destroy(() => {
      });
      return res.status(401).json({ error: "Sessao invalida." });
    }
    res.locals.user = user;
    next();
  };
  app.route("/api/auth/login").get(requireAuth, (req, res) => {
    res.status(200).json({
      ...sanitizeUser(res.locals.user),
      sessionId: req.sessionID
    });
  }).post(async (req, res) => {
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
      sessionId: req.sessionID
    });
  }).delete((req, res) => {
    req.session.destroy((error) => {
      if (error) {
        return res.status(500).json({ error: "Falha ao encerrar sessao." });
      }
      res.clearCookie("connect.sid");
      res.status(200).json({ ok: true });
    });
  });
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
        error: "Username invalido. Use 3-32 caracteres: letras, numeros e underscore."
      });
    }
    if (!email.includes("@")) {
      return res.status(400).json({ error: "Email invalido." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "A senha precisa ter ao menos 6 caracteres." });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Senha e confirma\xE7\xE3o estao diferentes." });
    }
    if (await database.isUsernameTaken(username)) {
      return res.status(409).json({ error: "Username ja esta em uso." });
    }
    if (await database.isEmailTaken(email)) {
      return res.status(409).json({ error: "Email ja esta em uso." });
    }
    const passwordData = createPasswordHash(password);
    const user = await database.createUser({
      id: uuidv43(),
      displayName,
      username,
      email,
      passwordHash: passwordData.hash,
      passwordSalt: passwordData.salt
    });
    req.session.userId = user.id;
    res.status(201).json({
      ...sanitizeUser(user),
      sessionId: req.sessionID
    });
  });
  app.post("/api/auth/avatar", requireAuth, upload.single("file"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Arquivo n\xE3o enviado." });
    }
    if (!ALLOWED_AVATAR_MIMES.has(req.file.mimetype)) {
      return res.status(415).json({ error: "Formato n\xE3o suportado. Use PNG, JPG, WEBP ou GIF." });
    }
    const user = res.locals.user;
    if (!user) {
      return res.status(401).json({ error: "N\xE3o autenticado." });
    }
    const uploadResult = await s3.uploadUserAsset({
      userId: user.id,
      type: "avatar",
      fileBuffer: req.file.buffer,
      contentType: req.file.mimetype,
      fileName: req.file.originalname
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
      sessionId: req.sessionID
    });
  });
  app.delete("/api/auth/avatar", requireAuth, async (req, res) => {
    const user = res.locals.user;
    if (!user) {
      return res.status(401).json({ error: "N\xE3o autenticado." });
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
      sessionId: req.sessionID
    });
  });
  app.post("/api/auth/gif-process", requireAuth, uploadBanner.single("file"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Arquivo n\xE3o enviado." });
    }
    if (req.file.mimetype !== "image/gif") {
      return res.status(415).json({ error: "Essa rota aceita apenas GIF." });
    }
    const user = res.locals.user;
    if (!user) {
      return res.status(401).json({ error: "N\xE3o autenticado." });
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
      return res.status(400).json({ error: "N\xE3o foi possivel ler dimensoes do GIF." });
    }
    const frameCount = metadata.pages ?? 1;
    if (frameCount > GIF_PROCESS_MAX_FRAMES) {
      return res.status(422).json({
        error: `GIF com muitos frames (${frameCount}). Limite: ${GIF_PROCESS_MAX_FRAMES}.`
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
    const outputBuffer = await image.extract({
      left,
      top,
      width: extractWidth,
      height: extractHeight
    }).resize(outputWidth, outputHeight, { fit: "fill", kernel: sharp.kernel.nearest }).gif({
      effort: 1,
      colours: 128,
      dither: 0,
      reuse: true,
      interFrameMaxError: 8,
      interPaletteMaxError: 8
    }).toBuffer();
    res.setHeader("Content-Type", "image/gif");
    return res.status(200).send(outputBuffer);
  });
  app.post("/api/auth/banner", requireAuth, uploadBanner.single("file"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Arquivo n\xE3o enviado." });
    }
    if (!ALLOWED_BANNER_MIMES.has(req.file.mimetype)) {
      return res.status(415).json({ error: "Formato n\xE3o suportado. Use PNG, JPG, WEBP ou GIF." });
    }
    const user = res.locals.user;
    if (!user) {
      return res.status(401).json({ error: "N\xE3o autenticado." });
    }
    if (!user.premium) {
      return res.status(403).json({ error: "Apenas usuarios premium podem usar banner." });
    }
    const uploadResult = await s3.uploadUserAsset({
      userId: user.id,
      type: "banner",
      fileBuffer: req.file.buffer,
      contentType: req.file.mimetype,
      fileName: req.file.originalname
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
      sessionId: req.sessionID
    });
  });
  app.delete("/api/auth/banner", requireAuth, async (req, res) => {
    const user = res.locals.user;
    if (!user) {
      return res.status(401).json({ error: "N\xE3o autenticado." });
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
      sessionId: req.sessionID
    });
  });
  app.patch("/api/auth/profile", requireAuth, async (req, res) => {
    const user = res.locals.user;
    if (!user) {
      return res.status(401).json({ error: "N\xE3o autenticado." });
    }
    const displayNameRaw = req.body?.displayName;
    const descriptionRaw = req.body?.description;
    const profileNoteRaw = req.body?.profileNote;
    const topRaw = req.body?.profileGradientTop;
    const bottomRaw = req.body?.profileGradientBottom;
    const bannerColorRaw = req.body?.profileBannerColor;
    const payload = {};
    if (typeof displayNameRaw === "string") {
      const displayName = displayNameRaw.trim();
      if (!displayName) {
        return res.status(400).json({ error: "Nome de exibi\xE7\xE3o n\xE3o pode ser vazio." });
      }
      if (displayName.length > 64) {
        return res.status(400).json({ error: "Nome de exibi\xE7\xE3o muito grande." });
      }
      payload.displayName = displayName;
    }
    if (typeof descriptionRaw === "string") {
      if (descriptionRaw.length > 300) {
        return res.status(400).json({ error: "Descri\xE7\xE3o muito grande (max 300)." });
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
      sessionId: req.sessionID
    });
  });
  app.get("/api/store/items/:type", async (req, res) => {
    const type = req.params.type && !isNaN(Number(req.params.type)) ? Number(req.params.type) : void 0;
    res.status(200).json(await database.listItemsStore(type));
  });
  const port = Number(process.env.SERVER_PORT || 6e3);
  httpServer.listen(port, () => {
    console.log(`API e Socket.IO ativos em http://localhost:${port}`);
  });
}
startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
