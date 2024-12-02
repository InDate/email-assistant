import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { project } from "./config";

// Create a service account for Gmail API
export const gmailServiceAccount = new gcp.serviceaccount.Account("gmailServiceAccount", {
    accountId: "gmail-service-account",
    displayName: "Domain Gmail Service Account",
});

// Create a key for the service account
export const gmailServiceAccountKey = new gcp.serviceaccount.Key("gmailServiceAccountKey", {
    serviceAccountId: gmailServiceAccount.name,
    publicKeyType: "TYPE_X509_PEM_FILE",
});

export const gmailPrivateKeySecret = new gcp.secretmanager.Secret("gmailServiceAccountPrivateKeySecret", {
    secretId: "gmail-service-account-privatekey-secret",
    replication: {
        userManaged: {
            replicas: [
                {
                    location: `${gcp.config.region}`,
                }]
        }
    },
    labels: {
        label: "pulumi-secret",
    },
});

export const secretVersion = new gcp.secretmanager.SecretVersion("gmailServiceAccountPrivateKeySecretVersion", {
    secret: gmailPrivateKeySecret.id,
    secretData: gmailServiceAccountKey.privateKey,
});

const functionIamBinding = new gcp.projects.IAMCustomRole("gmailAssistantRole", {
    roleId: "GmailAssistantRole",
    title: "Gmail Assistant Role",
    description: "Set of permissions needed for Gmail assistant Cloud Functions",
    permissions: [
        "secretmanager.versions.access",
        "storage.objects.create",
        "storage.objects.get",
        "storage.objects.update",
        "storage.objects.delete"
    ],
    project: project,
});

// Bind the custom role to the service account
const functionRoleBinding = new gcp.projects.IAMBinding("roleBinding", {
    project: project,
    role: functionIamBinding.id,
    members: [pulumi.interpolate`serviceAccount:${gmailServiceAccount.email}`],
},{dependsOn: [functionIamBinding, gmailServiceAccount]});

// Create a service account for Cloud Build
export const cloudBuildServiceAccount = new gcp.serviceaccount.Account("gmailCloudBuildServiceAccount", {
    accountId: "assist-build-service-account",
    displayName: "Gmail Assistant Cloud Build Service Account",
});

// Grant storage permissions to Cloud Build service account
export const cloudBuildStorageBinding = new gcp.projects.IAMBinding("cloudBuildStorageBinding", {
    project: project,
    role: "roles/storage.objectViewer",
    members: [
        pulumi.interpolate`serviceAccount:${cloudBuildServiceAccount.email}`
    ],
}, { dependsOn: cloudBuildServiceAccount });

// Grant Artifact Registry permissions to Cloud Build service account
export const cloudBuildArtifactBinding = new gcp.projects.IAMBinding("cloudBuildArtifactBinding", {
    project: project,
    role: "roles/artifactregistry.writer",
    members: [
        pulumi.interpolate`serviceAccount:${cloudBuildServiceAccount.email}`
    ],
}, { dependsOn: cloudBuildServiceAccount });

// Grant necessary permissions to Cloud Build service account
export const cloudBuildRoleBinding = new gcp.projects.IAMBinding("cloudBuildRoleBinding", {
    project: project,
    role: "roles/cloudfunctions.developer",
    members: [
        pulumi.interpolate`serviceAccount:${cloudBuildServiceAccount.email}`
    ],
}, { dependsOn: cloudBuildServiceAccount });

// Grant logging permissions to Cloud Build service account
export const cloudBuildLoggingBinding = new gcp.projects.IAMBinding("cloudBuildLoggingBinding", {
    project: project,
    role: "roles/logging.logWriter",
    members: [
        pulumi.interpolate`serviceAccount:${cloudBuildServiceAccount.email}`
    ],
}, { dependsOn: cloudBuildServiceAccount });

