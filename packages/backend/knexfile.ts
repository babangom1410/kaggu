import 'dotenv/config';
import type { Knex } from 'knex';

const pgConfig: Knex.Config = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  migrations: {
    directory: './src/migrations',
  },
  seeds: {
    directory: './src/seeds',
  },
};

const config: Record<string, Knex.Config> = {
  development: pgConfig,
  production: pgConfig,
};

export default config;
