import dotenv from "dotenv";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

dotenv.config();

type UserAssetType = "avatar" | "banner";

interface UploadUserAssetParams {
    userId: string;
    type: UserAssetType;
    fileBuffer: Buffer;
    contentType: string;
    fileName: string;
}

export class S3Service {
    private readonly endpoint: string;
    private readonly endpointType: string;
    private readonly region: string;
    private readonly bucket: string;
    private readonly client: S3Client;

    constructor() {
        const endpoint = process.env.S3_ENDPOINT;
        const endpointType = process.env.S3_ENDPOINT_TYPE;
        const region = process.env.S3_REGION;
        const accessKeyId = process.env.S3_ACCESS_KEY;
        const secretAccessKey = process.env.S3_SECRET_KEY;
        const bucket = process.env.S3_bucket;

        if (!endpoint || !endpointType || !region || !accessKeyId || !secretAccessKey || !bucket) {
            console.error(
                "Faltando variaveis de ambiente do S3. Defina S3_ENDPOINT, S3_ENDPOINT_TYPE, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY e S3_bucket.",
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
                secretAccessKey,
            },
        });
    }

    async uploadUserAsset({
        userId,
        type,
        fileBuffer,
        contentType,
        fileName,
    }: UploadUserAssetParams): Promise<{ key: string; url: string }> {
        const extension = path.extname(fileName) || "";
        const key = `users/${userId}/${type}/${Date.now()}-${uuidv4()}${extension}`;

        await this.client.send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: fileBuffer,
                ContentType: contentType,
            }),
        );

        return {
            key,
            url: this.buildFileUrl(key),
        };
    }

    async deleteFileByUrl(fileUrl: string | null | undefined): Promise<void> {
        if (!fileUrl) return;

        const key = this.extractKeyFromUrl(fileUrl);
        if (!key) return;

        await this.client.send(
            new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key,
            }),
        );
    }

    private buildFileUrl(key: string): string {
        if (this.endpointType === "PATH") {
            return `${this.endpoint}/${this.bucket}/${key}`;
        }

        const parsed = new URL(this.endpoint);
        return `${parsed.protocol}//${this.bucket}.${parsed.host}/${key}`;
    }

    private extractKeyFromUrl(fileUrl: string): string | null {
        try {
            const parsed = new URL(fileUrl);
            const pathname = parsed.pathname.replace(/^\/+/, "");
            if (!pathname) return null;

            if (this.endpointType === "PATH") {
                const bucketPrefix = `${this.bucket}/`;
                return pathname.startsWith(bucketPrefix)
                    ? pathname.slice(bucketPrefix.length)
                    : null;
            }

            return pathname;
        } catch {
            return null;
        }
    }
}
