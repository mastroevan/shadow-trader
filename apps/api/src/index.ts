import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import analyzeRouter from './routes/analyze';
import automationRouter from './routes/automation';
import watchlistRouter from './routes/watchlist';
import thesesRouter from './routes/theses';
import { requireApiKey } from './middleware/apiKeyAuth';
import { startAutomationScheduler } from './services/automationScheduler';

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'shadow-trader-api' }));
app.use('/api', requireApiKey);
app.use('/api', analyzeRouter);
app.use('/api', watchlistRouter);
app.use('/api', thesesRouter);
app.use('/api', automationRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Shadow Trader API running on port ${PORT}`);
  startAutomationScheduler();
});
