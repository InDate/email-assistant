# Email Assistant

A TypeScript-based email assistant that uses Gmail API and Google Cloud Functions to process and respond to emails.

## Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   cd cloud_functions && npm install
   ```

3. Configure your environment:
   - Copy `Pulumi.dev.yaml.example` to `Pulumi.dev.yaml`
   - Update the following values:
     - `gcp:project`: Your GCP project ID
     - `assistant:watch-account`: Your Gmail account to monitor
     - Other configuration values as needed

4. Set up Google Cloud:
   For new GCP projects, enable the following APIs:
     - Cloud Scheduler API 
     - Cloud Deploy API
     - Gmail API
     - Cloud Functions API
     - Cloud Run Admin API
     - Cloud Pub/Sub
     - Eventarc API
     - Secrets Manager

5. Configure Gmail workspace domain wide delegations, adding clientID. 

5. Deploy:
   ```bash
   pulumi up
   ```

## Development

### Testing
```bash
npm test
```

### Directory Structure
- `/cloud_functions`: Cloud Functions source code
- `/tests`: Test files
- `index.ts`: Pulumi infrastructure definition

## Security Notes

- Never commit sensitive information like API keys or service account credentials
- The `.gitignore` file is set up to exclude common sensitive files
- Replace all placeholder values (like `YOUR_EMAIL@example.com`) with your actual values
- Store sensitive information in environment variables or secret management systems

## License

MIT

## Useful Commands
Publish a Topic to pubsub to test watch function
```bash
gcloud pubsub topics publish email-assistant-watch-topic --message="Hello, Pub/Sub" --project <project_name>
```