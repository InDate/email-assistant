import { env } from "process";
import { GmailService, StorageService } from ".";

/**
 * Interface for environment variables.
 */
export interface EnvConfig {
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
    REPLY_FUNCTION_ID: string;
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
        'DEBUG_FOLDER',
    ] as const;

    const envConfig = {} as EnvConfig;

    for (const key of requiredEnvVars) {
        const value = process.env[key] || '';
        if (!value.trim()) {
            throw new Error(`${key} environment variable is required.`);
        }
        envConfig[key as keyof EnvConfig] = value;
    }

    envConfig.ROOT_FOLDER = process.env.ROOT_FOLDER?.trim() || '';
    
    return envConfig;
};

let config: EnvConfig;
export let storageService: StorageService;
export let gmailService: GmailService;

/**
 * Initializes the configuration by loading environment variables.
 */
export const initConfig = async (): Promise<EnvConfig> => {
    if (!config) {
        config = loadEnvConfig();
        storageService = new StorageService(config.GCP_CONTENT_BUCKET_NAME);
        gmailService = await GmailService.create(config.GMAIL_SECRET, config.WATCH_ACCOUNT);
    }
    return config;
};