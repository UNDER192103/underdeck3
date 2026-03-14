import { Collection, Db, MongoClient } from "mongodb";
import { StoreItem } from "@/types/store";
import dotenv from "dotenv";

dotenv.config();

export interface UserTag {
    name: string;
    icon?: string | null;
    description?: string;
    meta_data?: any;
}

export interface UserProfile {
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
    tags: UserTag[];
    createdAt: Date;
    updatedAt: Date;
}

interface UserDocument {
    id: string;
    displayName: string;
    username: string;
    usernameNormalized: string;
    email: string;
    emailNormalized: string;
    description: string;
    profileNote: string;
    avatarUrl: string | null;
    bannerUrl: string | null;
    profileBannerColor: string;
    premium: boolean;
    profileGradientTop: string;
    profileGradientBottom: string;
    tags?: UserTag[];
    passwordHash: string;
    passwordSalt: string;
    createdAt: Date;
    updatedAt: Date;
}

interface FriendRequestDocument {
    id: string;
    fromUserId: string;
    toUserId: string;
    status: "pending" | "accepted" | "rejected";
    createdAt: Date;
    updatedAt: Date;
}

interface FriendRelationDocument {
    userId: string;
    friendId: string;
    createdAt: Date;
}

interface DeviceDocument {
    id: string;
    ownerUserId: string;
    hwid: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    lastSeenAt: Date;
}

interface DeviceInviteDocument {
    id: string;
    deviceId: string;
    ownerUserId: string;
    token: string;
    expiresAt: Date | null;
    createdAt: Date;
    revokedAt?: Date | null;
}

interface DeviceSessionDocument {
    id: string;
    deviceId: string;
    ownerUserId: string;
    userId: string;
    status: "pending" | "active" | "denied" | "revoked" | "expired";
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    lastConnectedAt?: Date | null;
}

export class DatabaseService {
    private readonly mongoUri: string;
    private readonly mongoDatabase: string;
    private readonly client: MongoClient;
    private db?: Db;

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
            console.error("Não foi possivel conectar ao MongoDB", error);
            process.exit(1);
        }
    }

    getMongoClient() {
        return this.client;
    }

    async createUser(input: {
        id: string;
        displayName: string;
        username: string;
        email: string;
        passwordHash: string;
        passwordSalt: string;
    }): Promise<UserProfile> {
        const now = new Date();
        const doc: UserDocument = {
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
            updatedAt: now,
        };

        await this.getUsersCollection().insertOne(doc);
        return this.toUserProfile(doc);
    }

    async findUserById(id: string): Promise<UserProfile | null> {
        const doc = await this.getUsersCollection().findOne({ id });
        return doc ? this.toUserProfile(doc) : null;
    }

    async findUserAuthByIdentifier(identifier: string): Promise<UserDocument | null> {
        const normalized = identifier.trim().toLowerCase();
        return this.getUsersCollection().findOne({
            $or: [{ usernameNormalized: normalized }, { emailNormalized: normalized }],
        });
    }

    async isUsernameTaken(username: string): Promise<boolean> {
        const count = await this.getUsersCollection().countDocuments({
            usernameNormalized: username.trim().toLowerCase(),
        });
        return count > 0;
    }

    async isEmailTaken(email: string): Promise<boolean> {
        const count = await this.getUsersCollection().countDocuments({
            emailNormalized: email.trim().toLowerCase(),
        });
        return count > 0;
    }

    async updateUserAvatar(userId: string, avatarUrl: string | null): Promise<UserProfile | null> {
        const now = new Date();
        const result = await this.getUsersCollection().findOneAndUpdate(
            { id: userId },
            { $set: { avatarUrl, updatedAt: now } },
            { returnDocument: "after" },
        );

        return result ? this.toUserProfile(result) : null;
    }

    async updateUserBanner(userId: string, bannerUrl: string | null): Promise<UserProfile | null> {
        const now = new Date();
        const result = await this.getUsersCollection().findOneAndUpdate(
            { id: userId },
            { $set: { bannerUrl, updatedAt: now } },
            { returnDocument: "after" },
        );

        return result ? this.toUserProfile(result) : null;
    }

    async updateUserProfile(
        userId: string,
        payload: {
            displayName?: string;
            description?: string;
            profileNote?: string;
            profileBannerColor?: string;
            profileGradientTop?: string;
            profileGradientBottom?: string;
        },
    ): Promise<UserProfile | null> {
        const now = new Date();
        const updates: Record<string, unknown> = {
            updatedAt: now,
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
            { returnDocument: "after" },
        );

        return result ? this.toUserProfile(result) : null;
    }

    async listItemsStore(type?: number): Promise<StoreItem[]> {
        if (type) {
            const items = await this.getStoreCollection().find({ type: type as any }).toArray();
            return items;
        }
        const items = await this.getStoreCollection().find().toArray();
        return items;
    }

    async findUserByUsername(username: string): Promise<UserProfile | null> {
        const normalized = username.trim().toLowerCase();
        const doc = await this.getUsersCollection().findOne({ usernameNormalized: normalized });
        return doc ? this.toUserProfile(doc) : null;
    }

    async listUsersByIds(ids: string[]): Promise<UserProfile[]> {
        if (!ids.length) return [];
        const docs = await this.getUsersCollection().find({ id: { $in: ids } }).toArray();
        return docs.map((doc) => this.toUserProfile(doc));
    }

    async listFriends(userId: string): Promise<UserProfile[]> {
        const relations = await this.getFriendsCollection().find({ userId }).toArray();
        if (!relations.length) {
            return [];
        }
        const friendIds = relations.map((rel) => rel.friendId);
        const docs = await this.getUsersCollection().find({ id: { $in: friendIds } }).toArray();
        return docs.map((doc) => this.toUserProfile(doc));
    }

    async listFriendRequests(userId: string): Promise<{
        incoming: Array<FriendRequestDocument & { fromUser?: UserProfile | null }>;
        outgoing: Array<FriendRequestDocument & { toUser?: UserProfile | null }>;
    }> {
        const incoming = await this.getFriendRequestsCollection().find({ toUserId: userId, status: "pending" }).toArray();
        const outgoing = await this.getFriendRequestsCollection().find({ fromUserId: userId, status: "pending" }).toArray();

        const incomingFromIds = incoming.map((req) => req.fromUserId);
        const outgoingToIds = outgoing.map((req) => req.toUserId);
        const ids = Array.from(new Set([...incomingFromIds, ...outgoingToIds]));
        const users = ids.length ? await this.getUsersCollection().find({ id: { $in: ids } }).toArray() : [];
        const byId = new Map(users.map((doc) => [doc.id, this.toUserProfile(doc)]));

        return {
            incoming: incoming.map((req) => ({ ...req, fromUser: byId.get(req.fromUserId) ?? null })),
            outgoing: outgoing.map((req) => ({ ...req, toUser: byId.get(req.toUserId) ?? null })),
        };
    }

    async areFriends(userId: string, otherUserId: string): Promise<boolean> {
        const count = await this.getFriendsCollection().countDocuments({ userId, friendId: otherUserId });
        return count > 0;
    }

    async hasPendingFriendRequest(fromUserId: string, toUserId: string): Promise<boolean> {
        const count = await this.getFriendRequestsCollection().countDocuments({
            fromUserId,
            toUserId,
            status: "pending",
        });
        return count > 0;
    }

    async createFriendRequest(input: { id: string; fromUserId: string; toUserId: string }): Promise<FriendRequestDocument> {
        const now = new Date();
        const doc: FriendRequestDocument = {
            id: input.id,
            fromUserId: input.fromUserId,
            toUserId: input.toUserId,
            status: "pending",
            createdAt: now,
            updatedAt: now,
        };
        await this.getFriendRequestsCollection().insertOne(doc);
        return doc;
    }

    async acceptFriendRequest(requestId: string, userId: string): Promise<FriendRequestDocument | null> {
        const now = new Date();
        const result = await this.getFriendRequestsCollection().findOneAndUpdate(
            { id: requestId, toUserId: userId, status: "pending" },
            { $set: { status: "accepted", updatedAt: now } },
            { returnDocument: "after" },
        );
        if (!result) return null;
        await this.getFriendsCollection().updateOne(
            { userId: result.fromUserId, friendId: result.toUserId },
            { $setOnInsert: { userId: result.fromUserId, friendId: result.toUserId, createdAt: now } },
            { upsert: true },
        );
        await this.getFriendsCollection().updateOne(
            { userId: result.toUserId, friendId: result.fromUserId },
            { $setOnInsert: { userId: result.toUserId, friendId: result.fromUserId, createdAt: now } },
            { upsert: true },
        );
        return result;
    }

    async rejectFriendRequest(requestId: string, userId: string): Promise<FriendRequestDocument | null> {
        const now = new Date();
        const result = await this.getFriendRequestsCollection().findOneAndUpdate(
            { id: requestId, toUserId: userId, status: "pending" },
            { $set: { status: "rejected", updatedAt: now } },
            { returnDocument: "after" },
        );
        return result ?? null;
    }

    async upsertDevice(input: { ownerUserId: string; hwid: string; name: string }): Promise<DeviceDocument> {
        const now = new Date();
        const hwid = input.hwid.trim();
        const name = input.name.trim() || "Desktop";

        const existing = await this.getDevicesCollection().findOne({ ownerUserId: input.ownerUserId, hwid });
        if (existing) {
            const updated = await this.getDevicesCollection().findOneAndUpdate(
                { ownerUserId: input.ownerUserId, hwid },
                { $set: { name, updatedAt: now, lastSeenAt: now } },
                { returnDocument: "after" },
            );
            return updated ?? existing;
        }

        const id = this.generateNumericId();
        const doc: DeviceDocument = {
            id,
            ownerUserId: input.ownerUserId,
            hwid,
            name,
            createdAt: now,
            updatedAt: now,
            lastSeenAt: now,
        };
        await this.getDevicesCollection().insertOne(doc);
        return doc;
    }

    async listDevicesByOwner(ownerUserId: string): Promise<DeviceDocument[]> {
        return this.getDevicesCollection().find({ ownerUserId }).toArray();
    }

    async listDevicesByOwners(ownerUserIds: string[]): Promise<DeviceDocument[]> {
        if (!ownerUserIds.length) return [];
        return this.getDevicesCollection().find({ ownerUserId: { $in: ownerUserIds } }).toArray();
    }

    async getDeviceById(deviceId: string): Promise<DeviceDocument | null> {
        return this.getDevicesCollection().findOne({ id: deviceId });
    }

    async getDeviceByHwid(hwid: string): Promise<DeviceDocument | null> {
        return this.getDevicesCollection().findOne({ hwid: hwid.trim() });
    }

    async listDeviceInvites(deviceId: string, ownerUserId: string): Promise<DeviceInviteDocument[]> {
        return this.getDeviceInvitesCollection()
            .find({ deviceId, ownerUserId, revokedAt: { $in: [null, undefined] } })
            .sort({ createdAt: -1 })
            .toArray();
    }

    async countActiveInvites(deviceId: string, ownerUserId: string): Promise<number> {
        return this.getDeviceInvitesCollection().countDocuments({
            deviceId,
            ownerUserId,
            revokedAt: { $in: [null, undefined] },
        });
    }

    async createDeviceInvite(input: { id: string; deviceId: string; ownerUserId: string; token: string; expiresAt: Date | null }): Promise<DeviceInviteDocument> {
        const now = new Date();
        const doc: DeviceInviteDocument = {
            id: input.id,
            deviceId: input.deviceId,
            ownerUserId: input.ownerUserId,
            token: input.token,
            expiresAt: input.expiresAt,
            createdAt: now,
            revokedAt: null,
        };
        await this.getDeviceInvitesCollection().insertOne(doc);
        return doc;
    }

    async revokeDeviceInvite(inviteId: string, ownerUserId: string): Promise<DeviceInviteDocument | null> {
        const now = new Date();
        const result = await this.getDeviceInvitesCollection().findOneAndUpdate(
            { id: inviteId, ownerUserId, revokedAt: { $in: [null, undefined] } },
            { $set: { revokedAt: now } },
            { returnDocument: "after" },
        );
        return result ?? null;
    }

    async getInviteByToken(token: string): Promise<DeviceInviteDocument | null> {
        return this.getDeviceInvitesCollection().findOne({ token, revokedAt: { $in: [null, undefined] } });
    }

    async createDeviceSession(input: {
        id: string;
        deviceId: string;
        ownerUserId: string;
        userId: string;
        status: DeviceSessionDocument["status"];
        expiresAt: Date | null;
    }): Promise<DeviceSessionDocument> {
        const now = new Date();
        const doc: DeviceSessionDocument = {
            id: input.id,
            deviceId: input.deviceId,
            ownerUserId: input.ownerUserId,
            userId: input.userId,
            status: input.status,
            expiresAt: input.expiresAt,
            createdAt: now,
            updatedAt: now,
            lastConnectedAt: null,
        };
        await this.getDeviceSessionsCollection().insertOne(doc);
        return doc;
    }

    async updateDeviceSessionStatus(input: {
        id: string;
        ownerUserId: string;
        status: DeviceSessionDocument["status"];
    }): Promise<DeviceSessionDocument | null> {
        const now = new Date();
        const result = await this.getDeviceSessionsCollection().findOneAndUpdate(
            { id: input.id, ownerUserId: input.ownerUserId },
            { $set: { status: input.status, updatedAt: now } },
            { returnDocument: "after" },
        );
        return result ?? null;
    }

    async markSessionConnected(id: string): Promise<void> {
        const now = new Date();
        await this.getDeviceSessionsCollection().updateOne({ id }, { $set: { lastConnectedAt: now, updatedAt: now } });
    }

    async revokeDeviceSession(id: string, ownerUserId: string): Promise<DeviceSessionDocument | null> {
        const now = new Date();
        const result = await this.getDeviceSessionsCollection().findOneAndUpdate(
            { id, ownerUserId, status: { $in: ["active", "pending"] } },
            { $set: { status: "revoked", updatedAt: now } },
            { returnDocument: "after" },
        );
        return result ?? null;
    }

    async listDeviceSessions(deviceId: string, ownerUserId: string): Promise<DeviceSessionDocument[]> {
        return this.getDeviceSessionsCollection()
            .find({ deviceId, ownerUserId, status: { $in: ["pending", "active"] } })
            .sort({ createdAt: -1 })
            .toArray();
    }

    async listActiveSessionsForUser(userId: string): Promise<DeviceSessionDocument[]> {
        const now = new Date();
        return this.getDeviceSessionsCollection()
            .find({
                userId,
                status: "active",
                $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
            })
            .toArray();
    }

    async expireDeviceSessions(): Promise<DeviceSessionDocument[]> {
        const now = new Date();
        const expired = await this.getDeviceSessionsCollection()
            .find({
                status: { $in: ["pending", "active"] },
                expiresAt: { $ne: null, $lte: now },
            })
            .toArray();
        if (!expired.length) return [];
        await this.getDeviceSessionsCollection().updateMany(
            { id: { $in: expired.map((s) => s.id) } },
            { $set: { status: "expired", updatedAt: now } },
        );
        return expired;
    }

    async expireDeviceInvites(): Promise<DeviceInviteDocument[]> {
        const now = new Date();
        const expired = await this.getDeviceInvitesCollection()
            .find({
                revokedAt: { $in: [null, undefined] },
                expiresAt: { $ne: null, $lte: now },
            })
            .toArray();
        if (!expired.length) return [];
        await this.getDeviceInvitesCollection().updateMany(
            { id: { $in: expired.map((i) => i.id) } },
            { $set: { revokedAt: now } },
        );
        return expired;
    }

    async removeFriend(userId: string, otherUserId: string): Promise<boolean> {
        const friends = this.getFriendsCollection();
        const requests = this.getFriendRequestsCollection();
        const [friendsResult] = await Promise.all([
            friends.deleteMany({
                $or: [
                    { userId, friendId: otherUserId },
                    { userId: otherUserId, friendId: userId },
                ],
            }),
            requests.deleteMany({
                $or: [
                    { fromUserId: userId, toUserId: otherUserId, status: "pending" },
                    { fromUserId: otherUserId, toUserId: userId, status: "pending" },
                ],
            }),
        ]);
        return friendsResult.deletedCount > 0;
    }

    private toUserProfile(doc: UserDocument): UserProfile {
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
            updatedAt: doc.updatedAt,
        };
    }

    private normalizeTags(tags: UserTag[] | undefined): UserTag[] {
        if (!Array.isArray(tags)) {
            return [];
        }

        return tags
            .filter((tag) => tag && typeof tag.name === "string" && tag.name.trim().length > 0)
            .map((tag) => ({
                name: tag.name.trim(),
                icon: typeof tag.icon === "string" ? tag.icon : null,
                description: typeof tag.description === "string" ? tag.description : "",
                meta_data: tag.meta_data,
            }));
    }

    private getDb() {
        if (!this.db) {
            throw new Error("Banco de dados ainda não inicializado. Chame connect() primeiro.");
        }

        return this.db;
    }

    private getUsersCollection(): Collection<UserDocument> {
        return this.getDb().collection<UserDocument>("users");
    }

    private getStoreCollection(): Collection<StoreItem> {
        return this.getDb().collection<StoreItem>("store");
    }

    private getFriendRequestsCollection(): Collection<FriendRequestDocument> {
        return this.getDb().collection<FriendRequestDocument>("friend_requests");
    }

    private getFriendsCollection(): Collection<FriendRelationDocument> {
        return this.getDb().collection<FriendRelationDocument>("friends");
    }

    private getDevicesCollection(): Collection<DeviceDocument> {
        return this.getDb().collection<DeviceDocument>("devices");
    }

    private getDeviceInvitesCollection(): Collection<DeviceInviteDocument> {
        return this.getDb().collection<DeviceInviteDocument>("device_invites");
    }

    private getDeviceSessionsCollection(): Collection<DeviceSessionDocument> {
        return this.getDb().collection<DeviceSessionDocument>("device_sessions");
    }

    private generateNumericId() {
        const timePart = String(Date.now());
        const randomPart = Math.floor(Math.random() * 1e5).toString().padStart(5, "0");
        return `${timePart}${randomPart}`.slice(0, 18);
    }

    private async ensureIndexes() {
        const users = this.getUsersCollection();
        await Promise.all([
            users.createIndex({ id: 1 }, { unique: true }),
            users.createIndex({ usernameNormalized: 1 }, { unique: true }),
            users.createIndex({ emailNormalized: 1 }, { unique: true }),
        ]);

        const friendRequests = this.getFriendRequestsCollection();
        await Promise.all([
            friendRequests.createIndex({ id: 1 }, { unique: true }),
            friendRequests.createIndex({ fromUserId: 1, toUserId: 1, status: 1 }),
            friendRequests.createIndex({ toUserId: 1, status: 1 }),
        ]);

        const friends = this.getFriendsCollection();
        await Promise.all([
            friends.createIndex({ userId: 1, friendId: 1 }, { unique: true }),
        ]);

        const devices = this.getDevicesCollection();
        await Promise.all([
            devices.createIndex({ id: 1 }, { unique: true }),
            devices.createIndex({ ownerUserId: 1, hwid: 1 }, { unique: true }),
            devices.createIndex({ ownerUserId: 1 }),
        ]);

        const deviceInvites = this.getDeviceInvitesCollection();
        await Promise.all([
            deviceInvites.createIndex({ id: 1 }, { unique: true }),
            deviceInvites.createIndex({ token: 1 }, { unique: true }),
            deviceInvites.createIndex({ deviceId: 1, ownerUserId: 1 }),
        ]);

        const deviceSessions = this.getDeviceSessionsCollection();
        await Promise.all([
            deviceSessions.createIndex({ id: 1 }, { unique: true }),
            deviceSessions.createIndex({ deviceId: 1, ownerUserId: 1 }),
            deviceSessions.createIndex({ userId: 1, status: 1 }),
            deviceSessions.createIndex({ expiresAt: 1 }),
        ]);
    }
}
