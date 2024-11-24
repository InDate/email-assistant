import { GmailService, StorageService } from "./shared";
import { Message } from "@google-cloud/pubsub";

import { type Context } from '@google-cloud/functions-framework'

/**
 * Interface for environment variables.
 */
interface EnvConfig {
    GCP_PUBSUB_TOPIC: string;
    GCP_CONTENT_BUCKET_NAME: string;
    GMAIL_SECRET: string;
    LABEL_IDS: string;
    SCOPES: string;
    FILTER_ACTION: string;
    WATCH_ACCOUNT: string;
    ROOT_FOLDER?: string;
    HISTORY_FILE_NAME: string;
    EMAILS_FOLDER: string;
    DEBUG_FOLDER: string;
}

/**
 * Loads and validates environment variables.
 */
const loadEnvConfig = (): EnvConfig => {
    const requiredEnvVars = [
        'GCP_PUBSUB_TOPIC',
        'GCP_CONTENT_BUCKET_NAME',
        'GMAIL_SECRET',
        'LABEL_IDS',
        'SCOPES',
        'FILTER_ACTION',
        'WATCH_ACCOUNT',
        'HISTORY_FILE_NAME',
        'EMAILS_FOLDER',
        'DEBUG_FOLDER'
    ] as const;

    const envConfig = {} as EnvConfig;

    // Load all required environment variables
    for (const key of requiredEnvVars) {
        const value = process.env[key] || '';
        if (!value.trim()) {
            throw new Error(`${key} environment variable is required.`);
        }
        envConfig[key as keyof EnvConfig] = value;
    }

    // Handle optional ROOT_FOLDER
    envConfig.ROOT_FOLDER = process.env.ROOT_FOLDER?.trim() || '';

    return envConfig;
};

let config: EnvConfig;
let storageService: StorageService;
let gmailService: GmailService;

/**
 * Initializes the configuration by loading environment variables.
 */
const initConfig = async (): Promise<EnvConfig> => {
    if (!config) {
        config = loadEnvConfig();
        storageService = new StorageService(config.GCP_CONTENT_BUCKET_NAME);
        gmailService = await GmailService.create(config.GMAIL_SECRET, config.WATCH_ACCOUNT);
    }
    return config;
};

/**
 * A Google Cloud Function with an Pub/Sub trigger signature.
 *
 * @param {Message} event The Pub/Sub message
 * @param {Context} context The event metadata
 * @return {Promise} A Promise so the GCP function does not stop execution till the returned promise is resolved or gets rejected. 
 */
export const ProcessMessage = async (event: Message, context: Context) => {
    // Initialize configuration
    const config = await initConfig();

    try 
    {
        const message = event.data.toString('utf-8');
        console.debug('Raw message received:', message);

        let msgObj;
        try {
            msgObj = JSON.parse(message);
        } catch (parseError) {
            console.error('Failed to parse message:', message);
            console.error('Parse error:', parseError);
            throw new Error(`Invalid JSON message received: ${parseError.message}`);
        }

        if (!msgObj || typeof msgObj !== 'object') {
            console.error('Invalid message format:', msgObj);
            throw new Error('Message must be a JSON object');
        }

        /* TO DO
        - reading a JSON file each time is not going to scale well or save me money.
        - see Pulumi.dev.yaml for file name.
        - Rebuild after understanding its value.
        */
        return storageService.fileExist(config.ROOT_FOLDER + config.HISTORY_FILE_NAME).then(async function (exists) {
            if (exists) {
                await storageService.fetchFileContent(config.ROOT_FOLDER + config.HISTORY_FILE_NAME).then(async (data) => {
                    let prevMsgObj;
                    try {
                        prevMsgObj = JSON.parse(data.toString());
                    } catch (historyParseError) {
                        console.error('Failed to parse history file:', data.toString());
                        console.error('History parse error:', historyParseError);
                        throw new Error(`Invalid JSON in history file: ${historyParseError.message}`);
                    }
                    await moveForward(prevMsgObj.historyId, msgObj);
                });
            }
            else {
                console.debug("History File Did not Exist");
                await storageService.saveFileContent(config.ROOT_FOLDER + config.HISTORY_FILE_NAME, JSON.stringify(msgObj));
            }
            console.debug("Function execution completed");
        });
    }
    catch(ex) {
        // Log the full error details
        console.error('Error processing message:', {
            error: ex,
            stack: ex.stack,
            message: event.data?.toString('utf-8'),
            context: context
        });
        throw new Error("Error occured while processing message: " + ex);   
    }
};


/**
 * A Google Cloud Function with an HTTP trigger signature.
 * Starts Gmail Pub/Sub Notifications by calling the Gmail API "users.watch".
 *
 * @see {@link https://developers.google.com/gmail/api/reference/rest/v1/users/watch}
 */
export const StartWatch = async (message: any) => {
    try {
        // Initialize configuration
        const config = await initConfig();

        const gmailService = await GmailService.create(config.GMAIL_SECRET, config.WATCH_ACCOUNT);

        // Stop any existing watches
        await gmailService.stopWatch().catch((err: Error) => {
            console.error('Failed to stop Gmail watch:', err);
            throw new Error('Failed to stop Gmail watch');
        });

        // Parse label IDs from environment variable
        const splitLabelIds = config.LABEL_IDS.split(',').map(label => label.trim());

        // Start a new watch
        const watchResponse = await gmailService.startWatch({
            labelIds: splitLabelIds,
            topicName: config.GCP_PUBSUB_TOPIC
        });

        // Log the successful watch initiation
        console.info('Successfully started Gmail watch:', watchResponse);

        // Send success response
        return;
    } catch (ex: unknown) {
        const error = ex instanceof Error ? ex : new Error(String(ex));
        console.error('Error in startWatch:', error.message, error);

        // Send error response
        throw error;
    }
};


/**
 * A helper function to further process the previous history id and save the current Message Object for the next run's previous history id
 *
 * @param {String} prevHistoryId Previous history id which will be queried for the latest messages
 * @param {Object} msgObj The current message object containing the new history id
 */
async function moveForward(prevHistoryId: string, msgObj: string) {
    storageService.saveFileContent(config.ROOT_FOLDER + config.HISTORY_FILE_NAME, JSON.stringify(msgObj));
    await fetchMessageFromHistory(prevHistoryId);
}

/**
 * Fetches messages/updates starting from the given history ID, processes the updates, and identifies messages to send to the external webhook.
 *
 * @param {string} historyId The starting history ID.
 * @return {Promise<Object>} The list of updates from the given history ID.
 * @see {@link gmail.getHistoryList}
 */
async function fetchMessageFromHistory(historyId: string): Promise<object> {
    try {
        console.time("getHistoryList");

        // Fetch history list from Gmail API
        const res = await gmailService.getHistoryList({
            userId: "me",
            startHistoryId: historyId,
            labelId: config.LABEL_IDS,
        });

        console.timeEnd("getHistoryList");
        const history = res.history ?? [];

        if (history.length === 0) {
            console.log("No history updates found.");
            return res;
        }

        // Collect all unique messages
        let msgs: { id: string; threadId: string }[] = [];

        history.forEach((item) => {
            const labelsAdded = item.labelsAdded ?? [];
            const messagesAdded = item.messagesAdded ?? [];

            // Process labelsAdded
            labelsAdded.forEach((labelAdded) => {
                if (
                    labelAdded.labelIds?.some((r) => config.LABEL_IDS.includes(r)) &&
                    labelAdded.message?.id &&
                    labelAdded.message?.threadId
                ) {
                    msgs.push({
                        id: labelAdded.message.id,
                        threadId: labelAdded.message.threadId,
                    });
                }
            });

            // Process messagesAdded
            messagesAdded.forEach((messageAdded) => {
                if (messageAdded.message?.id && messageAdded.message?.threadId) {
                    msgs.push({
                        id: messageAdded.message.id,
                        threadId: messageAdded.message.threadId,
                    });
                }
            });
        });

        // Remove duplicate messages
        const uniqueMsgs = Array.from(
            new Map(
                msgs.map((msg) => [msg.id || msg.threadId, msg])
            ).values()
        );

        console.log(`Unique messages found: ${uniqueMsgs.length}`);

        let processedCount = 0;
        const processedMsgIds: string[] = [];

        // Process each unique message
        for (const { id: messageId } of uniqueMsgs) {
            console.time("getMessageData");
            const msg = await gmailService.getMessageData(messageId); // Fetch message content
            console.timeEnd("getMessageData");

            if (!msg) {
                console.error(`Message object was null: id: ${messageId}`);
                continue;
            }

            console.time("processEmail");
            await processEmail(msg, messageId); // Process the message
            console.timeEnd("processEmail");

            processedCount++;
            processedMsgIds.push(messageId);
        }

        console.log(
            `Messages found: ${uniqueMsgs.length} | Processed Messages: ${processedCount}`
        );
        console.log(`Processed Message IDs: ${processedMsgIds.join(", ")}`);

        // Save the fetched history content for debugging
        await storageService.saveFileContent(
            config.ROOT_FOLDER + config.DEBUG_FOLDER + `${historyId}.json`,
            JSON.stringify(res)
        );

        return res;
    } catch (error) {
        console.error("fetchMessageFromHistory ERROR:", error);
        throw new Error(`fetchMessageFromHistory ERROR: ${error}`);
    }
}

/**
 * Helper function to process the email data received from the Gmail API users.messages.get endpoint
 *
 * @param {Object} msg The message object that contains all the metadata of an email, like subject, snippet, body, to, form, etc.
 * @param {String} messageId The message ID of the message object being processed
 * @return {Null} Does not return anything, must use await if you want it to complete the processing but not mandatory to await
 * @see For detailed message object properties, visit {@link https://developers.google.com/gmail/api/reference/rest/v1/users.messages#Message}
 */
async function processEmail(msg: any, messageId: string) {
    try {

        const payload = msg.data.payload;
        const headers = payload.headers; // array of header objects containing subject and from values.
        const parts = payload.parts; // array of content (different types, plain, html, etc.)
        const emailType = payload.mimeType; // Either multipart or plain text is supported
        if (headers == null || headers == undefined) {
            console.debug("Header is not defined");
            return;
        }
        
        var email = {
            id: msg.data.id,
            from: "",
            to: "",
            subject: "",
            snippet: msg.data.snippet,
            bodyText: "",
            bodyHtml: ""
        };

        if(emailType.includes("plain")) {
            email.bodyText = payload.body.data;// Value is Base64 || Buffer.from(part.body.data, 'base64').toString('ascii');
        }
        else {
            if (parts == null || parts == undefined) {
                console.debug("Parts is not defined for msgId: " + messageId +  " mimeType: " + emailType);
                email.bodyText = payload.body.data;
            }
            else {
                parts.forEach((part: { mimeType: any; body: { data: string; }; }) => {
                    const mimeType = part.mimeType;
                    switch (mimeType) {
                        case "text/plain":
                            email.bodyText = part.body.data;// Value is Base64 || Buffer.from(part.body.data, 'base64').toString('ascii');
                            break;
                        case "text/html":
                            email.bodyHtml = part.body.data;// Value is Base64 || Buffer.from(part.body.data, 'base64').toString('ascii');
                            break;
                    }
                });
            }
        }


        headers.forEach((header: { name: any; value: string; }) => {
            const name = header.name;
            switch (name) {
                case "To":
                    email.to = header.value;
                    break;
                case "From":
                    email.from = header.value;
                    break;
                case "Subject":
                    email.subject = header.value;
                    break;
            }
        });

        
        storageService.saveFileContent(config.ROOT_FOLDER + config.DEBUG_FOLDER + messageId + "_msg.json", JSON.stringify(msg));
        storageService.saveFileContent(config.ROOT_FOLDER + config.EMAILS_FOLDER + messageId + "_email.json", JSON.stringify(email));

        var fromName = email.from.split("<")[0].trim();
        var notificationText = fromName + ": " + email.subject + "\n\n" + email.snippet;
        await sendReplyEmail(notificationText);

        console.debug("Message notification sent!: " + email.from + " - " + messageId);
    }
    catch (ex) {
        throw new Error("process email error: " + ex);
    }
}

async function sendReplyEmail(email:string) {
    console.log("Sending Email...")
}

/**
 * Global error handlers for unhandled promise rejections.
 */
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('rejectionHandled', (promise: Promise<unknown>) => {
    console.warn('Promise rejection was handled asynchronously:', promise);
});
