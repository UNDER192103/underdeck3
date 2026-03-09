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

    private async ensureIndexes() {
        const users = this.getUsersCollection();
        await Promise.all([
            users.createIndex({ id: 1 }, { unique: true }),
            users.createIndex({ usernameNormalized: 1 }, { unique: true }),
            users.createIndex({ emailNormalized: 1 }, { unique: true }),
        ]);
    }
}
