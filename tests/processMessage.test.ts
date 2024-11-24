import { ProcessMessage } from "../cloud_functions/src/index";
import { Message } from "@google-cloud/pubsub";
import { LocalWorkspace } from "@pulumi/pulumi/automation";

describe("processMessage", () => {
    let stackOutputs: any;
    let watchAccount: any;
    
    // Increase timeout for all tests in this describe block
    jest.setTimeout(30000);

    beforeAll(async () => {
        const stack = await LocalWorkspace.selectStack({
            stackName: "dev",
            workDir: "./",
        });

        stackOutputs = await stack.outputs();
        watchAccount = await stack.getConfig('assistant:watch-account');
        
        // Set up environment variables
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
    });

    afterAll(async () => {
        // Clean up any resources if needed
        process.env.LABEL_IDS = undefined;
        process.env.SCOPES = undefined;
        process.env.FILTER_ACTION = undefined;
        process.env.WATCH_ACCOUNT = undefined;
        process.env.GMAIL_SECRET = undefined;
        process.env.GCP_PUBSUB_TOPIC = undefined;
        process.env.GCP_CONTENT_BUCKET_NAME = undefined;
        process.env.HISTORY_FILE_NAME = undefined;
        process.env.EMAILS_FOLDER = undefined;
        process.env.DEBUG_FOLDER = undefined;
    });

    it("should handle base64 encoded message properly", async () => {
        // Create a mock PubSub message with the problematic base64 string
        const mockData = Buffer.from("eyJlbWFpbE"); // This is the problematic string from your error
        const mockMessage = {
            id: "test-id",
            ackId: "test-ack-id",
            data: mockData,
            attributes: {},
            orderingKey: "",
            publishTime: new Date(),
            received: 0,
            deliveryAttempt: 1,
            ack: jest.fn(),
            nack: jest.fn(),
            modAck: jest.fn(),
            _handled: false,
            _length: mockData.length,
            length: mockData.length,
            toString: () => mockData.toString('utf-8')
        } as unknown as Message;

        const mockContext = {};

        // This should throw an error since the base64 string is incomplete
        await expect(ProcessMessage(mockMessage, mockContext))
            .rejects
            .toThrow("Error occured while processing message: SyntaxError: Unexpected token");

        // Now let's try with a valid message
        const validMessageData = {
            emailId: "test123",
            historyId: "456",
            timestamp: new Date().toISOString()
        };

        const validData = Buffer.from(JSON.stringify(validMessageData));
        const validMessage = {
            id: "test-id",
            ackId: "test-ack-id",
            data: validData,
            attributes: {},
            orderingKey: "",
            publishTime: new Date(),
            received: 0,
            deliveryAttempt: 1,
            ack: jest.fn(),
            nack: jest.fn(),
            modAck: jest.fn(),
            _handled: false,
            _length: validData.length,
            length: validData.length,
            toString: () => validData.toString('utf-8')
        } as unknown as Message;

        // This should succeed
        await expect(ProcessMessage(validMessage, mockContext))
            .resolves
            .not.toThrow();
    });

    it("should handle non-JSON message properly", async () => {
        // Create a mock PubSub message with invalid JSON
        const mockData = Buffer.from("not a json string");
        const mockMessage = {
            id: "test-id",
            ackId: "test-ack-id",
            data: mockData,
            attributes: {},
            orderingKey: "",
            publishTime: new Date(),
            received: 0,
            deliveryAttempt: 1,
            ack: jest.fn(),
            nack: jest.fn(),
            modAck: jest.fn(),
            _handled: false,
            _length: mockData.length,
            length: mockData.length,
            toString: () => mockData.toString('utf-8')
        } as unknown as Message;

        const mockContext = {};

        // This should throw an error
        await expect(ProcessMessage(mockMessage, mockContext))
            .rejects
            .toThrow("Error occured while processing message: SyntaxError");
    });
});
