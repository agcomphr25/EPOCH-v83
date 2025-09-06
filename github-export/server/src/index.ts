// This file exports the individual route modules that are imported by server/src/routes/index.ts
// The main server setup is in server/index.ts

export { default as customersRouter } from './routes/customers';
export { default as ordersRouter } from './routes/orders';
export { default as inventoryRouter } from './routes/inventory';
export { default as formsRouter } from './routes/forms';
export { default as documentsRouter } from './routes/documents';
export { default as discountsRouter } from './routes/discounts';
export { default as employeesRouter } from './routes/employees';
export { default as qualityRouter } from './routes/quality';
export { default as bomsRouter } from './routes/boms';
export { default as moldsRouter } from './routes/molds';
export { default as kickbacksRouter } from './routes/kickbacks';
export { default as orderAttachmentsRouter } from './routes/orderAttachments';
export { default as tasksRouter } from './routes/tasks';
export { default as secureVerificationRouter } from './routes/secureVerification';
export { default as communicationsRouter } from './routes/communications';