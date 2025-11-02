import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./config/db.js";
import merchantAuthRoutes from './routes/merchantAuthRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js'; // Add this line

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));


connectDB();

app.use('/api/merchant/auth', merchantAuthRoutes);
app.use("/api/transactions", transactionRoutes);
app.use('/api/dashboard', dashboardRoutes); // Add this line

app.get('/', (req, res) => {
  res.send('Welcome to the PG-Merchant Backend API!');
});

// Add this to your main server file (app.js)
app.get('/api/debug-routes', (req, res) => {
  const routes = [];
  
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Routes registered directly on the app
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      // Router middleware
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            methods: Object.keys(handler.route.methods),
            source: 'router'
          });
        }
      });
    }
  });
  
  res.json({
    code: 200,
    totalRoutes: routes.length,
    routes: routes
  });
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));