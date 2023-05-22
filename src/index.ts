import * as core from '@actions/core'
import fs from 'fs';

import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import {
    buildSecretsList,
    isSecretArn,
    getSecretValue,
    injectSecret,
    extractAliasAndSecretIdFromInput,
    SecretValueResponse,
    saveEnvFile
} from "./utils";
import { CLEANUP_NAME } from "./constants";

export async function run(): Promise<void> {
    try {
        // Default client region is set by configure-aws-credentials
        const client : SecretsManagerClient = new SecretsManagerClient({region: process.env.AWS_DEFAULT_REGION, customUserAgent: "github-action"});
        const secretConfigInputs: string[] = [...new Set(core.getMultilineInput('secret-ids'))];
        const parseJsonSecrets = core.getBooleanInput('parse-json-secrets');
        const exportToEnvFile = core.getBooleanInput('export-to-env-file');
        const pathMameEnvFile = core.getInput('path-name-env-file');

        // Get final list of secrets to request
        core.info('Building secrets list...');
        const secretIds: string[] = await buildSecretsList(client, secretConfigInputs);

        // Keep track of secret names that will need to be cleaned from the environment
        let secretsToCleanup = [] as string[];

        core.info('Your secret names may be transformed in order to be valid environment variables (see README). Enable Debug logging in order to view the new environment names.');

        // Get and inject secret values
        for (let secretId of secretIds) {
            //  Optionally let user set an alias, i.e. `ENV_NAME,secret_name`
            let secretAlias = '';
            [secretAlias, secretId] = extractAliasAndSecretIdFromInput(secretId);

            // Retrieves the secret name also, if the value is an ARN
            const isArn = isSecretArn(secretId);

            try {
                const secretValueResponse : SecretValueResponse = await getSecretValue(client, secretId);
                if (!secretAlias){
                    secretAlias = isArn ? secretValueResponse.name : secretId;
                }

                const injectedSecrets = injectSecret(secretAlias, secretValueResponse.secretValue, parseJsonSecrets);
                secretsToCleanup = [...secretsToCleanup, ...injectedSecrets];
            } catch (err) {
                // Fail action for any error
                core.setFailed(`Failed to fetch secret: '${secretId}'. Error: ${err}.`)
            } 
        }

        if(exportToEnvFile){
            saveEnvFile(pathMameEnvFile, JSON.stringify(secretsToCleanup));
        } else{
            core.exportVariable(CLEANUP_NAME, JSON.stringify(secretsToCleanup));
        }
        // Export the names of variables to clean up after completion

        core.info("Completed adding secrets.");
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message)
    }
}



run();