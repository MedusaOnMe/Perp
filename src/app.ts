import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { initializeFirebase } from '../config/firebase';
import authRoutes from './api/routes/auth';
import exportRoutes from './api/routes/export';
import balanceRoutes from './api/routes/balance';
import depositRoutes from './api/routes/deposit';
import orderlyAccountRoutes from './api/routes/orderly-account';
import orderlyOrderRoutes from './api/routes/orderly-order';
import orderlyDepositWithdrawalRoutes from './api/routes/orderly-deposit-withdrawal';

// Load environment variables
dotenv.config();

// Initialize Firebase
initializeFirebase();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory with proper content types
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  }
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/balance', balanceRoutes);
app.use('/api/deposit', depositRoutes);

// Orderly Network API Routes
app.use('/api/orderly/account', orderlyAccountRoutes);
app.use('/api/orderly/order', orderlyOrderRoutes);
app.use('/api/orderly', orderlyDepositWithdrawalRoutes);

// Root route - explicitly serve index.html
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Catch-all route - serve index.html for SPA routing
app.get('*', (req, res) => {
  // Only serve index.html for non-API routes
  if (!req.path.startsWith('/api')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.join(__dirname, '../public/index.html'));
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 XPerps API server running on port ${PORT}`);
  console.log(`🌐 Frontend: http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🐦 Twitter bot handle: @${process.env.TWITTER_BOT_HANDLE}`);
});

export default app;
