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
