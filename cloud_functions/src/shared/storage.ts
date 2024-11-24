import { Storage } from '@google-cloud/storage';

export class StorageService {
    private gcStorage: Storage;
    private bucketName: string;

    constructor(bucketName?: string) {
        this.gcStorage = new Storage(); // No keyFilename needed when running inside GCP
        this.bucketName = bucketName || process.env.GCP_CONTENT_BUCKET_NAME || '';

        if (!this.bucketName) {
            throw new Error('Bucket name must be provided either through constructor or GCP_CONTENT_BUCKET_NAME environment variable.');
        }
    }

    /**
     * Helper function to save some data (content) to a file at the given path, currently configured for Google Cloud Storage
     *
     * @param filePath Location + filename with extension to save the content in
     * @param content Any content that needs to be saved to the File System
     * @return A Promise that resolves when the file is successfully saved (returns true on resolve), any error must be caught by `.catch` function
     * @see {@link https://googleapis.dev/nodejs/storage/latest/File.html#save}
     */
    async saveFileContent(filePath: string, content: string): Promise<boolean> {
        const defOptions = {
            resumable: false,
            validation: false
        };
        await this.gcStorage.bucket(this.bucketName).file(filePath).save(content, defOptions);
        return true;
    }

    /**
     * Helper function to check if a file exists at the given path, currently configured for Google Cloud Storage
     *
     * @param filePath Location + filename with extension to check
     * @return A Promise that resolves when the file is either found or not found, returns true if found else false when resolved. Any error must be caught by `.catch` function
     * @see {@link https://googleapis.dev/nodejs/storage/latest/File.html#exists}
     */
    async fileExist(filePath: string): Promise<boolean> {
        const [doesExist] = await this.gcStorage.bucket(this.bucketName).file(filePath).exists();
        return doesExist;
    }

    /**
     * Helper function to get the content of a file, currently configured for Google Cloud Storage
     *
     * @param filePath Location + filename with extension to fetch the content from
     * @return A Promise that resolves with the content (data) of the given file, returns an array of data as per the GCP Storage API, linked below.
     * @see {@link https://googleapis.dev/nodejs/storage/latest/File.html#download}
     */
    async fetchFileContent(filePath: string): Promise<Buffer> {
        const [data] = await this.gcStorage.bucket(this.bucketName).file(filePath).download();
        return data;
    }

    /**
     * Helper function to delete a file, currently configured for Google Cloud Storage
     *
     * @param filePath Location + filename with extension of a file to delete
     * @return A Promise that resolves when the file is deleted, returns true if resolved (file is deleted). Any error must be caught by `.catch` function
     * @see {@link https://googleapis.dev/nodejs/storage/latest/File.html#delete}
     */
    async deleteFile(filePath: string): Promise<boolean> {
        await this.gcStorage.bucket(this.bucketName).file(filePath).delete();
        return true;
    }
}