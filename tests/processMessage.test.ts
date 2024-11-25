import { ProcessMessage } from "../cloud_functions/src/index";
import { LocalWorkspace } from "@pulumi/pulumi/automation";
import { GmailService } from "../cloud_functions/src/shared";

describe("processMessage", () => {
    let stackOutputs: any;
    let watchAccount: any;

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
    })


    it("should handle base64 encoded message properly, incorrect data", async () => {
        // Create a mock PubSub message with the problematic base64 string
        const mockData = "eyJlbWFpbE"; // This is the problematic string from your error
        const mockMessage = {
            data: mockData,
            message_id: "test-message-id",
            publish_time: new Date().toDateString()
        };

        const mockContext = {};

        // This should throw an error since the base64 string is incomplete
        await expect(ProcessMessage(mockMessage, mockContext))
            .rejects
            .toThrow()

    });
    it("should handle base64 encoded message properly, correct data", async () => {
        // Now let's try with a valid message
        const mockContext = {};

        const validMessageData = {
            emailAddress: "one@gmail.com",
            historyId: "456",
        };

        const validData = Buffer.from(JSON.stringify(validMessageData));
        const mockMessage = {
            data: validData.toString('base64'),
            message_id: "test-message-id",
            publish_time: new Date().toDateString()
        };


        // This should succeed
        await expect(ProcessMessage(mockMessage, mockContext))
            .resolves
            .not.toThrow();
    });
    it("should handle non-JSON message properly", async () => {
        // Create a mock PubSub message with invalid JSON
        const mockData = Buffer.from("not a json string");
        const mockMessage = {
            data: mockData.toString(),
            message_id: "test-message-id",
            publish_time: new Date().toDateString()
        };

        const mockContext = {};

        // This should throw an error
        await expect(ProcessMessage(mockMessage, mockContext))
            .rejects
            .toThrow("Error occured while processing message: Invalid JSON message received: Unexpected token o in JSON at position 1");
    });
    
    it("get history incorrect data", async () => {
        // Create a mock PubSub message with the problematic base64 string
        const gmailService = await GmailService.create(process.env.GMAIL_SECRET as string, process.env.WATCH_ACCOUNT as string);


        const message = await gmailService.getHistoryList({userId: process.env.WATCH_ACCOUNT, historyTypes: ["messageAdded"]})

        const history = await gmailService.getMessageList()
        // This should throw an error since the base64 string is incomplete
        await expect(await gmailService.getMessageData("779064"))
            .not.toThrow()

    });
});
