import dotenv from 'dotenv';
import path from 'path';
import { defineConfig } from "prisma/config";

dotenv.config({
  path: path.resolve(process.cwd(), "../../.env"),
});

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
