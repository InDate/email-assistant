import { type Context } from '@google-cloud/functions-framework';
import { initConfig, storageService } from './shared/config';
import { fetchMessageFromHistory, MessageObject } from './shared/emailProcessor';
import { gmailService } from './shared/config';

interface PubSubEvent {
    data: string;
    message_id: string;
    publish_time: string;
}

/**
 * A Google Cloud Function with an Pub/Sub trigger signature.
 */
export const ProcessMessage = async (event: PubSubEvent, context: Context) => {
    const config = await initConfig();
    console.debug('Event message received:', event);
    try 
    {
        const message = event.data
            ? Buffer.from(event.data, 'base64').toString()
            : 'No data provided';
        const msgObj : MessageObject = JSON.parse(message);

    return storageService.fileExist(config.HISTORY_FILE_NAME).then(async function (exists) {
        if (exists) {
            await storageService.fetchFileContent(config.HISTORY_FILE_NAME).then(async (history) => {
                const prevMsgObj : MessageObject = JSON.parse(history.toString());
                storageService.saveFileContent(config.HISTORY_FILE_NAME, JSON.stringify(msgObj));
                await fetchMessageFromHistory(prevMsgObj.historyId);
            });
        }
        else {
            console.debug("History File Did not Exist");
            await storageService.saveFileContent(config.HISTORY_FILE_NAME, JSON.stringify(msgObj));
        }
        console.debug("Function execution completed");
    });

    } catch (error) {
        const ex = error as Error;
        console.error('Error processing message:', {
            error: ex.message,
            stack: ex.stack
        });
        throw error;
    }
};

/**
 * A Google Cloud Function with an HTTP trigger signature.
 * Starts Gmail Pub/Sub Notifications by calling the Gmail API "users.watch".
 */
export const StartWatch = async (message: any) => {
    try {
        const config = await initConfig();
        
        // Stop any existing watches first
        await gmailService.stopWatch().catch((err: Error) => {
            console.error('Failed to stop Gmail watch:', err);
            throw new Error('Failed to stop Gmail watch');
        });

        // Parse label IDs from environment variable
        const splitLabelIds = config.LABEL_IDS.split(',').map(label => label.trim());

        console.debug('Filtered Label IDs:', splitLabelIds, 'Watch Account:', config.WATCH_ACCOUNT, 'Topic:', config.GCP_PUBSUB_TOPIC);
        // Start a new watch
        const watchResponse = await gmailService.startWatch({
            labelIds: splitLabelIds,
            topicName: config.GCP_PUBSUB_TOPIC
        });

        console.info('Successfully started Gmail watch and updated history ID:', watchResponse);
    } catch (error) {
        console.error('Error in StartWatch:', error);
        throw error;
    }
};

/**
 * Global error handlers for unhandled promise rejections.
 */
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});