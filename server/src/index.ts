import express from 'express';
import cookieParser from 'cookie-parser';
import { 
  customersRouter, 
  ordersRouter, 
  inventoryRouter, 
  formsRouter, 
  documentsRouter, 
  discountsRouter, 
  employeesRouter, 
  qualityRouter, 
  bomsRouter, 
  moldsRouter, 
  kickbacksRouter, 
  orderAttachmentsRouter, 
  tasksRouter,
  secureVerificationRouter,
  communicationsRouter
} from './routes';

const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Register all API routes
app.use('/api/customers', customersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/forms', formsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/discounts', discountsRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/quality', qualityRouter);
app.use('/api/boms', bomsRouter);
app.use('/api/molds', moldsRouter);
app.use('/api/kickbacks', kickbacksRouter);
app.use('/api/order-attachments', orderAttachmentsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/secure-verification', secureVerificationRouter);
app.use('/api/communications', communicationsRouter);

const PORT = parseInt(process.env.PORT || '5000');
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`API server listening on ${HOST}:${PORT}`);
});

export default app;