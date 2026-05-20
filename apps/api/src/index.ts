import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { monitorRouter } from './routes/monitor';
import { investigateRouter } from './routes/investigate';
import { reasonRouter } from './routes/reason';
import { actionRouter } from './routes/action';

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

app.use('/api/monitor', monitorRouter);
app.use('/api/investigate', investigateRouter);
app.use('/api/reason', reasonRouter);
app.use('/api/action', actionRouter);

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'shadow-trader-api' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Shadow Trader API running on port ${PORT}`));