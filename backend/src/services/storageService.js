const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require('fs');
const path = require('path');

class StorageService {
    constructor() {
        this.client = new S3Client({
            region: process.env.AWS_REGION || "us-east-1",
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        this.bucketName = process.env.AWS_BUCKET_NAME;
    }

    async uploadRecording(filePath, userEmail) {
        const fileName = path.basename(filePath);
        const s3Key = `${userEmail}/${fileName}`;

        console.log(`[StorageService] Uploading ${fileName} to S3 bucket: ${this.bucketName}...`);

        try {
            const fileStream = fs.createReadStream(filePath);
            const uploadParams = {
                Bucket: this.bucketName,
                Key: s3Key,
                Body: fileStream,
                ContentType: "audio/webm",
            };

            await this.client.send(new PutObjectCommand(uploadParams));

            const cloudUrl = `https://${this.bucketName}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${s3Key}`;
            console.log(`[StorageService] Upload successful! URL: ${cloudUrl}`);

            return cloudUrl;
        } catch (err) {
            console.error('[StorageService] [ERROR] S3 Upload Error:', err.message);

            // Fallback for local dev if S3 fails (invalid bucket name etc)
            console.warn('[StorageService] [WARN] Falling back to local URL for simulation');
            return `local://${userEmail}/${fileName}`;
        }
    }

    async uploadText(content, fileName, userEmail) {
        const s3Key = `${userEmail}/transcripts/${fileName}`;
        console.log(`[StorageService] Uploading transcript ${fileName} to S3...`);

        try {
            const uploadParams = {
                Bucket: this.bucketName,
                Key: s3Key,
                Body: content,
                ContentType: "text/plain",
            };

            await this.client.send(new PutObjectCommand(uploadParams));
            const cloudUrl = `https://${this.bucketName}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${s3Key}`;
            console.log(`[StorageService] Transcript uploaded! URL: ${cloudUrl}`);
            return cloudUrl;
        } catch (err) {
            console.error('[StorageService] [ERROR] S3 Text Upload Error:', err.message);
            return null;
        }
    }
}

module.exports = new StorageService();
