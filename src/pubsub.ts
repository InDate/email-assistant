import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { gmailServiceAccount } from "./iam";

export const pubsubTopicWatch = new gcp.pubsub.Topic("gmailWatchTopic", {
    name: "email-assistant-watch-topic",
});

export const pubsubTopicEmail = new gcp.pubsub.Topic("gmailEmailTopic", {
    name: "email-assistant-email-topic",
});

export const topicIamMember = new gcp.pubsub.TopicIAMMember("gmailWatchTopicPublisher", {
    topic: pubsubTopicEmail.name,
    role: "roles/pubsub.publisher",
    member: "serviceAccount:gmail-api-push@system.gserviceaccount.com",
});

// Gmail watch resubscription (every 7 days)
export const resubscriptionSchedule = new gcp.cloudscheduler.Job("gmailWatchResubscription", {
    schedule: "0 0 */7 * *", // Every 7 days
    timeZone: "UTC",
    pubsubTarget: {
        topicName: pubsubTopicWatch.id,
        data: Buffer.from(
            JSON.stringify({
                message: "Trigger Gmail Watch Resubscription",
            })
        ).toString("base64"),
    },
});
