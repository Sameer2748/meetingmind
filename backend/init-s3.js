require('dotenv').config();
const { S3Client, CreateBucketCommand, HeadBucketCommand } = require("@aws-sdk/client-s3");

async function initS3() {
    const client = new S3Client({
        region: process.env.AWS_REGION || "us-east-1",
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
    });

    const bucketName = process.env.AWS_BUCKET_NAME;

    console.log(`[S3 Init] Checking bucket: ${bucketName}...`);

    try {
        await client.send(new HeadBucketCommand({ Bucket: bucketName }));
        console.log(`[S3 Init] Bucket "${bucketName}" already exists.`);
    } catch (err) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
            console.log(`[S3 Init] Bucket not found. Creating "${bucketName}"...`);
            try {
                // If region is us-east-1, we don't need LocationConstraint
                const createParams = { Bucket: bucketName };
                if (process.env.AWS_REGION && process.env.AWS_REGION !== 'us-east-1') {
                    createParams.CreateBucketConfiguration = {
                        LocationConstraint: process.env.AWS_REGION
                    };
                }

                await client.send(new CreateBucketCommand(createParams));
                console.log(`[S3 Init] Successfully created bucket: ${bucketName}`);
            } catch (createErr) {
                console.error(`[S3 Init] [ERROR] Failed to create bucket:`, createErr.message);
            }
        } else {
            console.error(`[S3 Init] [ERROR] Error checking bucket:`, err.message);
            console.log(`Tip: Ensure your IAM user has 's3:CreateBucket' and 's3:ListBucket' permissions.`);
        }
    }
}

initS3();
