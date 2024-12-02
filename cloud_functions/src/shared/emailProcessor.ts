import { gmailService, storageService } from './config';

export interface MessageObject {
    emailAddress?: string;
    historyId: string;
}

export interface Email {
    id: string;
    from: string;
    to: string;
    subject: string;
    snippet: string;
    bodyText: string;
    bodyHtml: string;
}

/**
 * Fetches messages/updates starting from the given history ID.
 * 
 */
export async function fetchMessageFromHistory(historyId: string): Promise<object> {
    try {
        console.time("getHistoryList");
        const res = await gmailService.getHistoryList({
            userId: process.env.WATCH_ACCOUNT,
            startHistoryId: historyId,
            labelId: process.env.LABEL_IDS,
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
                    labelAdded.labelIds?.some((r) => process.env.LABEL_IDS?.includes(r)) &&
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
            new Map(msgs.map((msg) => [msg.id || msg.threadId, msg])).values()
        );

        console.log(`Unique messages found: ${uniqueMsgs.length}`);

        let processedCount = 0;
        const processedMsgIds: string[] = [];

        // Process each unique message
        for (const { id: messageId } of uniqueMsgs) {
            console.time("getMessageData");
            const msg = await gmailService.getMessageData(messageId);
            console.timeEnd("getMessageData");

            if (!msg) {
                console.error(`Message object was null: id: ${messageId}`);
                continue;
            }

            console.time("processEmail");
            await processEmail(msg, messageId);
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
            `${process.env.ROOT_FOLDER}${process.env.DEBUG_FOLDER}${historyId}.json`,
            JSON.stringify(res)
        );

        return res;
    } catch (error) {
        console.error("fetchMessageFromHistory ERROR:", error);
        throw new Error(`fetchMessageFromHistory ERROR: ${error}`);
    }
}

/**
 * Process the email data received from Gmail API.
 */
export async function processEmail(msg: any, messageId: string) {
    try {
        const payload = msg.payload;
        const headers = payload.headers;
        const parts = payload.parts;
        const emailType = payload.mimeType;

        if (!headers) {
            console.debug("Header is not defined");
            return;
        }
        
        const email: Email = {
            id: msg.id,
            from: "",
            to: "",
            subject: "",
            snippet: msg.snippet,
            bodyText: "",
            bodyHtml: ""
        };

        if(emailType.includes("plain")) {
            email.bodyText = payload.body.data;
        } else {
            if (!parts) {
                console.debug("Parts is not defined for msgId: " + messageId +  " mimeType: " + emailType);
                email.bodyText = payload.body.data;
            } else {
                parts.forEach((part: { mimeType: string; body: { data: string; }; }) => {
                    switch (part.mimeType) {
                        case "text/plain":
                            email.bodyText = part.body.data;
                            break;
                        case "text/html":
                            email.bodyHtml = part.body.data;
                            break;
                    }
                });
            }
        }

        headers.forEach((header: { name: string; value: string; }) => {
            switch (header.name) {
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

        await storageService.saveFileContent(
            `${process.env.ROOT_FOLDER}${process.env.DEBUG_FOLDER}${messageId}_msg.json`,
            JSON.stringify(msg)
        );
        await storageService.saveFileContent(
            `${process.env.ROOT_FOLDER}${process.env.EMAILS_FOLDER}${messageId}_email.json`,
            JSON.stringify(email)
        );

        const fromName = email.from.split("<")[0].trim();
        const notificationText = `${fromName}: ${email.subject}\n\n${email.snippet}`;
        await sendReplyEmail(notificationText);

        console.debug("Message notification sent!: " + email.from + " - " + messageId);
    } catch (ex) {
        throw new Error("process email error: " + ex);
    }
}

export async function sendReplyEmail(email: string) {
    console.log("Sending Email..." + email);
}
