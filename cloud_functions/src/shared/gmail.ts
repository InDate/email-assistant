import { google, gmail_v1 } from "googleapis";

export class GmailService {
    private secret: string;
    private watchAccount: string;
    private authenticatedClient!: gmail_v1.Gmail;

    private constructor(secret: string, watchAccount: string) {
        this.secret = secret;
        this.watchAccount = watchAccount;
    }

    /**
     * Initialize the Gmail service by authenticating with the provided credentials.
     * @throws Error if authentication fails
     */
    async initialize(): Promise<void> {
        try {
            const decodedCredentials = JSON.parse(
                Buffer.from(this.secret, "base64").toString("utf-8")
            );
            const decodedPrivateKey = decodedCredentials.private_key.toString();

            const authClient = new google.auth.JWT({
                key: decodedPrivateKey,
                scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
                email: decodedCredentials.client_email,
                subject: this.watchAccount,
            });

            // Authorize the client
            await authClient.authorize();

            // Create the authenticated client
            this.authenticatedClient = google.gmail({ auth: authClient, version: "v1" });
        } catch (error) {
            console.error("Error in Gmail authentication:", error);
            throw new Error("Failed to authenticate Gmail API client");
        }
    }

    static async create(secret: string, watchAccount: string): Promise<GmailService> {
        const service = new GmailService(secret, watchAccount);
        await service.initialize();
        return service;
    }

    /**
     * Performs the Gmail API call to users.history.list Endpoint
     *
     * @param options Query parameters as per the Gmail API documentation
     * @return {Promise<gmail_v1.Schema$ListHistoryResponse>} A Promise that resolves with the history data
     * @see {@link https://developers.google.com/gmail/api/reference/rest/v1/users.history/list}
     */
    async getHistoryList(
        options: gmail_v1.Params$Resource$Users$History$List
    ): Promise<gmail_v1.Schema$ListHistoryResponse> {
        try {
            const response = await this.authenticatedClient.users.history.list(options);
            return response.data;
        } catch (ex) {
            console.error("History list error:", ex);
            throw ex;
        }
    }

    /**
 * Performs the Gmail API call to users.history.list Endpoint
 *
 * @param options Query parameters as per the Gmail API documentation
 * @return {Promise<gmail_v1.Schema$ListHistoryResponse>} A Promise that resolves with the history data
 * @see {@link https://developers.google.com/gmail/api/reference/rest/v1/users.history/list}
 */
    async getMessageList(
    ): Promise<gmail_v1.Schema$ListHistoryResponse> {
        try {
            const response = await this.authenticatedClient.users.messages.list({
                userId: this.watchAccount,
                labelIds: ["UNREAD"]
            });
            return response.data;
        } catch (ex) {
            console.error("Message list error:", ex);
            throw ex;
        }
    }

    /**
     * Performs the Gmail API call to users.messages.get Endpoint
     *
     * @param messageId The message ID for which details (data) are required
     * @return {Promise<gmail_v1.Schema$Message>} A Promise that resolves with the message details
     * @see {@link https://developers.google.com/gmail/api/reference/rest/v1/users.messages/get}
     */
    async getMessageData(
        messageId: string
    ): Promise<gmail_v1.Schema$Message> {
        try {
            const response = await this.authenticatedClient.users.messages.get({
                userId: this.watchAccount,
                id: messageId,
            });
            return response.data;
        } catch (ex) {
            console.error("Message data error:", ex);
            throw ex;
        }
    }

    async stopWatch(): Promise<void> {
        await this.authenticatedClient.users.stop({
            userId: this.watchAccount
        });
    }

    async startWatch(options: { labelIds: string[], topicName: string }): Promise<any> {
        const response = await this.authenticatedClient.users.watch({
            userId: this.watchAccount,
            requestBody: {
                topicName: options.topicName,
                labelIds: options.labelIds,
                labelFilterAction: 'include'  // Default to include, can be made configurable if needed
            },
        });
        return response.data;
    }
}