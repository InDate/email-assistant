import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { region, project } from "./config";
import { gmailServiceAccount } from "./iam";

export const bucket = new gcp.storage.Bucket("gmailWatchSourceBucket", {
    name: `${project}-source`,
    location: region,
    uniformBucketLevelAccess: true
});

export const functionSource = new gcp.storage.BucketObject("gmailCloudFunction", {
    bucket: bucket.name,
    source: new pulumi.asset.AssetArchive({
        "package.json": new pulumi.asset.FileAsset("./cloud_functions/package.json"),
        "package-lock.json": new pulumi.asset.FileAsset("./cloud_functions/package-lock.json"),
        "tsconfig.json": new pulumi.asset.FileAsset("./cloud_functions/tsconfig.txt"),
        "src": new pulumi.asset.FileArchive("./cloud_functions/src"),
    })
});

export const contentBucket = new gcp.storage.Bucket("assistantContentBucket", {
    name: `${project}-content`,
    location: region,
    uniformBucketLevelAccess: true
});

// Grant Storage Object Viewer role to the Gmail service account
export const gmailStorageBinding = new gcp.storage.BucketIAMMember("gmailStorageBinding", {
    bucket: contentBucket.name,
    role: "roles/storage.objectViewer",
    member: pulumi.interpolate`serviceAccount:${gmailServiceAccount.email}`,
}, {dependsOn: [contentBucket]});
