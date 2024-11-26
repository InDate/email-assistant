import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as fs from "fs-extra";
import * as path from "path";
import { asset } from "@pulumi/pulumi";

// Load the configuration
let gcpConfig = new pulumi.Config("gcp");
const region = gcpConfig.require("region");
const project = gcpConfig.require("project");
let assistantConfig = new pulumi.Config("assistant");
const watchAccount = assistantConfig.require("watch-account")

// Create a service account for Gmail API
const gmailServiceAccount = new gcp.serviceaccount.Account("gmailServiceAccount", {
    accountId: "gmail-service-account",
    displayName: "Domain Gmail Service Account",
});

// Create a key for the service account
const gmailServiceAccountKey = new gcp.serviceaccount.Key("gmailServiceAccountKey", {
    serviceAccountId: gmailServiceAccount.name,
    publicKeyType: "TYPE_X509_PEM_FILE",
});

const secretManagerRole = new gcp.projects.IAMMember("secretManagerRole", {
    project: project,
    role: "roles/secretmanager.secretAccessor",
    member: pulumi.interpolate`serviceAccount:${gmailServiceAccount.email}`, // Use the service account's email
});

const gmailPrivateKeySecret = new gcp.secretmanager.Secret("gmailServiceAccountPrivateKeySecret", {
    secretId: "gmail-service-account-privatekey-secret",
    replication: {
        userManaged: {
            replicas: [
                {
                    location: `${gcp.config.region}`,
                }]
            }
        },
    labels: {
        label: "pulumi-secret",
    },
});

const secretVersion = new gcp.secretmanager.SecretVersion("gmailServiceAccountPrivateKeySecretVersion", {
    secret: gmailPrivateKeySecret.id,
    secretData: gmailServiceAccountKey.privateKey,
});

/*
const secretAccessPermission = new gcp.secretmanager.SecretIamMember("gmailServiceAccountKeyAccess", {
    secretId: gmailPrivateKeySecret.id,
    role: "roles/secretmanager.secretAccessor",
    member: `serviceAccount:${gmailServiceAccount.email}`,
}, {dependsOn: [gmailPrivateKeySecret, gmailServiceAccount]});
*/

const pubsubTopicWatch = new gcp.pubsub.Topic("gmailWatchTopic", {
    name: "email-assistant-watch-topic",
});

const pubsubTopicEmail = new gcp.pubsub.Topic("gmailNewEmailTopic", {
    name: "email-assistant-new-email-topic",
});

// Dead Letter Queue topic for failed messages
const deadLetterTopic = new gcp.pubsub.Topic("deadLetterTopic", {
    name: "email-assistant-dlq-topic",
});

// Create a subscription with dead letter policy
const emailSubscription = new gcp.pubsub.Subscription("emailSubscription", {
    topic: pubsubTopicEmail.name,
    deadLetterPolicy: {
        deadLetterTopic: deadLetterTopic.id,
        maxDeliveryAttempts: 5,
    },
});

const topicIamMember = new gcp.pubsub.TopicIAMMember("gmailWatchTopicPublisher", {
    topic: pubsubTopicEmail.name,
    role: "roles/pubsub.publisher",
    member: "serviceAccount:gmail-api-push@system.gserviceaccount.com",
});

// Gmail watch resubscription (every 7 days)
const resubscriptionSchedule = new gcp.cloudscheduler.Job("gmailWatchResubscription", {
    schedule: "0 0 */7 * *", // Every 7 days
    timeZone: "UTC", // Adjust the time zone if needed
    pubsubTarget: {
        topicName: pubsubTopicWatch.id,
        data: Buffer.from(
            JSON.stringify({
                message: "Trigger Gmail Watch Resubscription",
            })
        ).toString("base64"), // Base64-encoded payload
    },
});

const bucket = new gcp.storage.Bucket("gmailWatchSourceBucket", {
    name: `${project}-source`,
    location: region,
    uniformBucketLevelAccess: true
});

// Create a temporary directory for the cloud function source without node_modules
const tmpDir = !pulumi.runtime.isDryRun() 
    ? (() => {
        const dir = fs.mkdtempSync(path.join("/tmp", "cloud-function-"));
        try {
            // Copy only the necessary files
            fs.copySync("./cloud_functions/src", path.join(dir, "src"));
            fs.copyFileSync("./cloud_functions/package.json", path.join(dir, "package.json"));
            fs.copyFileSync("./cloud_functions/package-lock.json", path.join(dir, "package-lock.json"));
            fs.copyFileSync("./cloud_functions/tsconfig.txt", path.join(dir, "tsconfig.json"));
            return dir;
        } catch (error) {
            // Clean up on error
            fs.removeSync(dir);
            throw error;
        }
    })()
    : "./cloud_functions"; // During preview, just point to the source directory

const functionSource = new gcp.storage.BucketObject("gmailCloudFunction", {
    bucket: bucket.name,
    source: new asset.FileArchive(tmpDir)
})

const contentBucket = new gcp.storage.Bucket("assistantContentBucket", {
    name: `${project}-content`,
    location: region,
    uniformBucketLevelAccess: true
});

// Grant Storage Object Viewer role to the Gmail service account
const gmailStorageBinding = new gcp.storage.BucketIAMMember("gmailStorageBinding", {
    bucket: contentBucket.name,
    role: "roles/storage.objectViewer",
    member: pulumi.interpolate`serviceAccount:${gmailServiceAccount.email}`,
});

// Factory function to create Gmail Cloud Functions
const createGmailFunction = (
    name: string,
    pubsubTopic: pulumi.Input<string>,
    entryPoint: string,
) => {
    return new gcp.cloudfunctionsv2.Function(name, {
        location: region,
        eventTrigger: {
            pubsubTopic: pubsubTopic,
            eventType: "google.cloud.pubsub.topic.v1.messagePublished",
            retryPolicy: "RETRY_POLICY_RETRY"
        },
        buildConfig: {
            runtime: 'nodejs22',
            entryPoint: entryPoint,
            source: {
                storageSource: {
                    bucket: bucket.name,
                    object: functionSource.name,
                }
            }
        },
        serviceConfig: {
            ingressSettings: "ALLOW_INTERNAL_ONLY",
            serviceAccountEmail: gmailServiceAccount.email,
            environmentVariables: {
                ["GCP_CONTENT_BUCKET_NAME"]: contentBucket.name,
                ["GCP_PUBSUB_TOPIC"]: pubsubTopicEmail.id,
                ["LABEL_IDS"]: assistantConfig.require("label-Ids"),
                ["SCOPES"]: assistantConfig.require("scopes"),
                ["FILTER_ACTION"]: assistantConfig.require("filter-action"),
                ["WATCH_ACCOUNT"]: assistantConfig.require("watch-account"),
                ["ROOT_FOLDER"]: assistantConfig.require("root-folder"),
                ["HISTORY_FILE_NAME"]: assistantConfig.require("history-file-name"),
                ["EMAILS_FOLDER"]: assistantConfig.require("emails-folder"),
                ["DEBUG_FOLDER"]: assistantConfig.require("debug-folder"),
            },
            secretEnvironmentVariables: [{
                projectId: project,
                key: "GMAIL_SECRET",
                secret: gmailPrivateKeySecret.secretId,
                version: "latest"
            }],
        },
    });
};

// Create the Gmail reply function using the factory
const gmailReplyFunction = createGmailFunction(
    "gmailReply",
    pubsubTopicEmail.id,
    "ProcessMessage"
);

// Create the Gmail watch function using the factory
const gmailWatchFunction = createGmailFunction(
    "gmailWatch",
    pubsubTopicWatch.id,
    "StartWatch"
);

// Export the DNS name of the bucket
export const serviceAccount = gmailServiceAccount.email
export const clientID = gmailServiceAccount.uniqueId;
export const gmailSecret = gmailServiceAccountKey.privateKey;
export const watchTopic = pubsubTopicWatch.id;
export const contentBucketName = contentBucket.name;
export const emailTopic = pubsubTopicEmail.id;