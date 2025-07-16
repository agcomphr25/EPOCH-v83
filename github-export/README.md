# EPOCH v8 ERP System

A comprehensive Enterprise Resource Planning (ERP) system built with React, Express, and PostgreSQL.

## Features

- **Order Management**: Complete order processing and tracking
- **Order Entry**: Advanced order creation with customer management
- **Inventory Management**: Real-time inventory tracking and scanning
- **Employee Portal**: Timekeeping and employee management
- **Discount Management**: Flexible discount calculation system
- **Finance Dashboard**: Financial reporting and analytics
- **Enhanced Forms**: Dynamic form builder and submissions
- **QC & Maintenance**: Quality control and preventive maintenance

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Radix UI
- **Backend**: Express.js, Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **Mobile**: Capacitor for mobile deployment
- **PWA**: Progressive Web App capabilities

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd epoch-v8-erp
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

4. Set up the database:
```bash
npm run db:push
```

5. Start the development server:
```bash
npm run dev
```

## Production Deployment

1. Build the application:
```bash
npm run build
```

2. Start the production server:
```bash
npm start
```

## Environment Variables

Create a `.env` file with the following variables:

```env
DATABASE_URL=your_postgresql_connection_string
PORT=5000
NODE_ENV=production
```

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run check` - Type checking
- `npm run db:push` - Push database schema

## Mobile Deployment

This app supports mobile deployment via Capacitor:

1. Set up Capacitor:
```bash
chmod +x scripts/setup-capacitor.sh
./scripts/setup-capacitor.sh
```

2. Build and sync:
```bash
npm run build
npx cap sync
```

3. Open in mobile IDE:
```bash
npx cap open android  # For Android
npx cap open ios      # For iOS
```

## License

MIT License
