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
   - Enable required APIs:
     - Gmail API
     - Cloud Functions
     - Cloud Pub/Sub
   - Create a service account with necessary permissions
   - Download service account key and encode it in base64

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
