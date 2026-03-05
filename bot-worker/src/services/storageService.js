const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const extract = require('extract-zip');

class StorageService {
    constructor() {
        this.client = new S3Client({
            region: process.env.AWS_REGION || "us-east-1",
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        this.bucketName = process.env.S3_BUCKET_NAME || process.env.AWS_BUCKET_NAME;
    }

    async uploadRecording(filePath, userEmail) {
        const fileName = path.basename(filePath);
        const s3Key = `${userEmail}/${fileName}`;
        console.log(`[StorageService] Uploading ${fileName} to S3...`);
        try {
            const contentType = filePath.endsWith('.webm') ? 'video/webm' : 'application/octet-stream';
            const upload = new Upload({
                client: this.client,
                params: {
                    Bucket: this.bucketName,
                    Key: s3Key,
                    Body: fs.createReadStream(filePath),
                    ContentType: contentType,
                },
            });
            await upload.done();
            return `https://${this.bucketName}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${s3Key}`;
        } catch (err) {
            console.error('[StorageService] Recording upload error:', err.message);
            return `local://${userEmail}/${fileName}`;
        }
    }

    async uploadText(content, fileName, userEmail) {
        const s3Key = `${userEmail}/transcripts/${fileName}`;
        try {
            await this.client.send(new PutObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key,
                Body: content,
                ContentType: "text/plain",
            }));
            return `https://${this.bucketName}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${s3Key}`;
        } catch (err) {
            console.error('[StorageService] Transcript upload error:', err.message);
            return null;
        }
    }

    // ZIP and Upload bot profiles to S3
    async syncProfilesToS3(profilesDir) {
        const zipPath = path.join(path.dirname(profilesDir), 'bot_profiles.zip');
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        // Only sync essential auth data — skip browser cache dirs that bloat the zip.
        // These dirs are regenerated automatically by Chrome on next launch.
        const SKIP_DIRS = new Set([
            'Cache', 'Code Cache', 'GPUCache', 'DawnCache',
            'blob_storage', 'Network', 'databases',
            'GrShaderCache', 'ShaderCache', 'VideoDecodeStats',
        ]);

        console.log('[StorageService] Zipping profiles for S3 backup (cache excluded)...');

        return new Promise((resolve, reject) => {
            output.on('close', async () => {
                const mb = (archive.pointer() / (1024 * 1024)).toFixed(1);
                console.log(`[StorageService] Zip complete (${mb} MB)`);
                try {
                    const upload = new Upload({
                        client: this.client,
                        params: {
                            Bucket: this.bucketName,
                            Key: 'system/bot_profiles.zip',
                            Body: fs.createReadStream(zipPath),
                        },
                    });
                    await upload.done();
                    console.log('[StorageService] ✓ Profiles synced to S3 (replaced previous)');
                    fs.unlinkSync(zipPath); // Delete local zip
                    resolve(true);
                } catch (e) {
                    console.error('[StorageService] Sync upload failed:', e.message);
                    reject(e);
                }
            });

            archive.on('error', (err) => reject(err));
            archive.pipe(output);

            // Walk the profile dir manually to skip heavy cache folders
            const addDir = (srcDir, destPrefix) => {
                if (!fs.existsSync(srcDir)) return;
                for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
                    if (SKIP_DIRS.has(entry.name)) continue; // skip cache
                    const srcPath = path.join(srcDir, entry.name);
                    const destPath = destPrefix ? `${destPrefix}/${entry.name}` : entry.name;
                    if (entry.isDirectory()) {
                        addDir(srcPath, destPath);
                    } else {
                        archive.file(srcPath, { name: destPath });
                    }
                }
            };
            addDir(profilesDir, '');

            archive.finalize();
        });
    }

    // Download and Extract bot profiles from S3
    async downloadProfilesFromS3(targetDir) {
        console.log('[StorageService] Checking S3 for bot_profiles backup...');
        const zipPath = path.join(path.dirname(targetDir), 'bot_profiles_download.zip');

        try {
            const response = await this.client.send(new GetObjectCommand({
                Bucket: this.bucketName,
                Key: 'system/bot_profiles.zip',
            }));

            const writer = fs.createWriteStream(zipPath);
            let downloadedBytes = 0;
            const totalBytes = parseInt(response.ContentLength || 0);

            await new Promise((resolve, reject) => {
                response.Body.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    if (downloadedBytes % (5 * 1024 * 1024) < chunk.length) { // Log every 5MB
                        const mb = (downloadedBytes / (1024 * 1024)).toFixed(1);
                        console.log(`[StorageService] Download progress: ${mb}MB${totalBytes ? ` / ${(totalBytes / (1024 * 1024)).toFixed(1)}MB` : ''}`);
                    }
                });
                response.Body.pipe(writer);
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            console.log('[StorageService] Extracting profiles...');
            if (fs.existsSync(targetDir)) {
                fs.rmSync(targetDir, { recursive: true, force: true });
            }
            fs.mkdirSync(targetDir, { recursive: true });
            await extract(zipPath, { dir: targetDir, overwrite: true });

            fs.unlinkSync(zipPath);
            console.log('[StorageService] ✓ Profiles restored from S3');
            return true;
        } catch (err) {
            console.error('[StorageService] ❌ Failed to download/extract profiles from S3:', err.message);
            return false;
        }
    }
}

module.exports = new StorageService();
