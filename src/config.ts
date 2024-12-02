import * as pulumi from "@pulumi/pulumi";

// Load the configuration
export const gcpConfig = new pulumi.Config("gcp");
export const region = gcpConfig.require("region");
export const project = gcpConfig.require("project");
export const assistantConfig = new pulumi.Config("assistant");
export const watchAccount = assistantConfig.require("watch-account");
