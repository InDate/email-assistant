import { LocalWorkspace } from "@pulumi/pulumi/automation";
import { StartWatch } from "../cloud_functions/src/index";
import { GmailService } from "../cloud_functions/src/shared/gmail";
import * as pulumi from '@pulumi/pulumi';

describe("startWatch (Integration Test with Pulumi)", () => {
    let stackOutputs: any;
    let watchAccount: any;
    let gmailService: GmailService;

    // Increase timeout for all tests in this describe block
    jest.setTimeout(30000);

    beforeAll(async () => {
        const startTime = Date.now();

        const stack = await LocalWorkspace.selectStack({
            stackName: "dev",
            workDir: "./",
        });

        console.log(`Stack selection took ${Date.now() - startTime}ms`);

        stackOutputs = await stack.outputs();
        watchAccount = await stack.getConfig('assistant:watch-account');

        console.log(`Stack outputs retrieval took ${Date.now() - startTime}ms`);
        
        process.env.LABEL_IDS = "UNREAD";
        process.env.SCOPES = "https://www.googleapis.com/auth/gmail.readonly";
        process.env.FILTER_ACTION = "include";
        process.env.WATCH_ACCOUNT = watchAccount.value;
        process.env.GMAIL_SECRET = stackOutputs.gmailSecret.value;
        process.env.GCP_PUBSUB_TOPIC = stackOutputs.watchTopic.value;
        process.env.GCP_CONTENT_BUCKET_NAME = stackOutputs.contentBucketName.value;
        process.env.HISTORY_FILE_NAME = "history.json";
        process.env.EMAILS_FOLDER = "emails/";
        process.env.DEBUG_FOLDER = "debug/";

        // Initialize GmailService for all tests
        gmailService = await GmailService.create(
            stackOutputs.gmailSecret.value,
            watchAccount.value
        );
    });

    it("should initialize GmailService with valid credentials", async () => {
        const newService = await GmailService.create(
            stackOutputs.gmailSecret.value,
            watchAccount.value
        );
        
        // Test that the service can make an API call
        await expect(newService.stopWatch()).resolves.not.toThrow();
    }, 15000);

    it("should stop a watch successfully", async () => {
        try {
            await gmailService.stopWatch();
        } catch (error) {
            console.error("Error stopping Gmail watch:", error);
            throw error;
        }
    }, 15000);

    it("should start a new watch successfully", async () => {
        try {
            const watchResponse = await gmailService.startWatch({
                labelIds: ["UNREAD"],
                topicName: stackOutputs.emailTopic.value
            });
            expect(watchResponse).toBeDefined();
            expect(watchResponse.historyId).toBeDefined();
        } catch (error) {
            console.error("Error starting Gmail watch:", error);
            throw error;
        }
    }, 15000);
});