# WMS - Waste Management System

## Setup Instructions

### Local Development

1. Clone repository
2. Run `npm install`
3. Create `.env` file with your credentials
4. Run `npm run dev`

### Production Deployment (Tinkerhost)

1. Upload files to Tinkerhost
2. Set up environment variables in cPanel
3. Run `npm install --production`
4. Start with PM2: `pm2 start server.js --name wms-app`

## Environment Variables

- `PORT`: Server port (default: 5000)
- `DB_HOST`: MySQL host
- `DB_USER`: MySQL username
- `DB_PASSWORD`: MySQL password
- `DB_NAME`: MySQL database name
- `JWT_SECRET`: JWT secret key

## Progressive Web App

The web app can be installed from a supported browser over HTTPS (or localhost). Its service worker caches same-origin static assets and a generic offline page; account pages, API responses, and personal data are never cached. Live features such as maps, tracking, and submissions still require an internet connection.

On Android, open the HTTPS site in Chrome or Edge and tap **Install app** (or choose **Install app** / **Add to Home screen** from the browser menu). On iPhone or iPad, open the HTTPS site in Safari, tap **Share**, then **Add to Home Screen**. The install action requires HTTPS; a plain HTTP address on a phone or local network is not installable. App icons are provided as square PNGs in the manifest and as an Apple touch icon.

## CI/CD (GitHub Actions and Railway)

The `CI/CD` workflow runs on pull requests and pushes to `main`. It installs dependencies and checks the syntax of the server and PWA scripts. A successful push to `main` is then deployed to Railway; pull requests and manual workflow runs only validate the code.

Before enabling deployments, configure these GitHub Actions repository values:

- `RAILWAY_TOKEN` (secret): a Railway project token.
- `RAILWAY_PROJECT_ID` (variable): the Railway project ID.
- `RAILWAY_SERVICE_ID` (variable): the service to deploy.
- `RAILWAY_ENVIRONMENT_ID` (variable): the target environment ID.

The workflow deploys only to the configured Railway service and environment. Keep application credentials in Railway's environment variables, not in GitHub workflow files.
