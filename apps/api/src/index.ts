import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import setupsRouter from './routes/setups';
import watchlistRouter from './routes/watchlist';
import thesesRouter from './routes/theses';
import observabilityRouter from './routes/observability';
import { requireApiKey } from './middleware/apiKeyAuth';

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'shadow-trader-api' }));
app.use('/api', requireApiKey);
app.use('/api', setupsRouter);
app.use('/api', watchlistRouter);
app.use('/api', thesesRouter);
app.use('/api', observabilityRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Shadow Trader API running on port ${PORT}`);
});
