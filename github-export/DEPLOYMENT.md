
# Deployment Guide

## Local Development

1. **Clone and Install**:
```bash
git clone <your-repo-url>
cd epoch-v8-erp
npm install
```

2. **Environment Setup**:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. **Database Setup**:
```bash
npm run db:push
```

4. **Start Development**:
```bash
npm run dev
```

## Production Deployment

### Option 1: Traditional VPS/Server

1. **Build the application**:
```bash
npm run build
```

2. **Set production environment**:
```bash
export NODE_ENV=production
export DATABASE_URL=your_production_db_url
```

3. **Start the server**:
```bash
npm start
```

### Option 2: Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 5000
CMD ["npm", "start"]
```

### Option 3: Replit Deployment

1. Import this repository to Replit
2. The app will auto-configure and run
3. Use Replit's deployment feature for production hosting

## Database Migration

If you have an existing database, run:
```bash
npm run db:generate
npm run db:migrate
```

## Mobile App Deployment

For mobile app deployment:
```bash
npm run mobile:setup
npm run mobile:sync
npm run mobile:android  # or mobile:ios
```

## Environment Variables

Required environment variables:

- `DATABASE_URL`: PostgreSQL connection string
- `PORT`: Server port (default: 5000)
- `NODE_ENV`: Environment (development/production)

Optional:
- `SMARTYSTREETS_AUTH_ID`: For address validation
- `SMARTYSTREETS_AUTH_TOKEN`: For address validation
