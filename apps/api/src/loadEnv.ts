// Loads the repo-root .env. Must be the first import in index.ts: several
// modules (ledgerGate, tradeRiskConfig) read process.env when they are loaded,
// so .env has to be applied before any of them are imported.
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});
