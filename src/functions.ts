import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { project,region } from "./config";
import { gmailServiceAccount, gmailPrivateKeySecret, cloudBuildServiceAccount, secretVersion } from "./iam";
import { bucket, functionSource, contentBucket, gmailStorageBinding } from "./storage";
import { pubsubTopicEmail, pubsubTopicWatch } from "./pubsub";
import { assistantConfig } from "./config";

// Factory function to create Gmail Cloud Functions
export const createGmailFunction = (
    name: string,
    pubsubTopic: pulumi.Input<string>,
    entryPoint: string,
) => {
    return new gcp.cloudfunctionsv2.Function(name, {
        location: region,
        eventTrigger: {
            pubsubTopic: pubsubTopic,
            eventType: "google.cloud.pubsub.topic.v1.messagePublished",
            retryPolicy: "RETRY_POLICY_RETRY",
        },
        buildConfig: {
            runtime: 'nodejs22',
            entryPoint: entryPoint,
            source: {
                storageSource: {
                    bucket: bucket.name,
                    object: functionSource.name,
                }
            },
            serviceAccount: cloudBuildServiceAccount.id
        },
        serviceConfig: {
            serviceAccountEmail: gmailServiceAccount.email,
            ingressSettings: "ALLOW_INTERNAL_ONLY",
            environmentVariables: {
                ["GCP_CONTENT_BUCKET_NAME"]: contentBucket.name,
                ["FUNCTION_PATH"]: pulumi.interpolate`projects/${project}/locations/${region}/functions/`,
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
    },{dependsOn: [secretVersion, gmailStorageBinding]});
};



// Create the Gmail reply function using the factory
export const gmailReplyFunction = createGmailFunction(
    "gmailReply",
    pubsubTopicEmail.id,
    "ProcessMessage"
);

// Create the Gmail watch function using the factory
export const gmailWatchFunction = createGmailFunction(
    "gmailWatch",
    pubsubTopicWatch.id,
    "StartWatch"
);
