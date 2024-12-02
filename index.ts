import { gmailServiceAccount, gmailServiceAccountKey } from './src/iam';
import { contentBucket } from './src/storage';
import { pubsubTopicEmail, pubsubTopicWatch } from './src/pubsub';
import './src/functions';  // Import for side effects
import { gmailReplyFunction } from './src/functions';

// Export the required values
export const serviceAccount = gmailServiceAccount.email;
export const clientID = gmailServiceAccount.uniqueId;
export const gmailSecret = gmailServiceAccountKey.privateKey;
export const watchTopic = pubsubTopicWatch.id;
export const emailTopic = pubsubTopicEmail.id;

export const contentBucketName = contentBucket.name;
export const replyFunction = gmailReplyFunction.id;