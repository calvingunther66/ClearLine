import express from 'express';
import cors from 'cors';
import { getSystemStats } from './system.ts';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// API Routes
app.get('/api/system-stats', (req, res) => {
  const stats = getSystemStats();
  res.json(stats);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
