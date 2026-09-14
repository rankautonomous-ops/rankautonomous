import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './lib/database';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', service: 'api', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', service: 'api', database: 'disconnected' });
  }
});

const server = app.listen(port, () => {
  console.log(`API Server running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    console.log('HTTP server closed');
    await prisma.$disconnect();
    process.exit(0);
  });
});

