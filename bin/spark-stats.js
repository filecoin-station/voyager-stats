import http from 'node:http'
import { once } from 'node:events'
import pg from 'pg'
import Sentry from '@sentry/node'
import fs from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createHandler } from '../lib/handler.js'
import { DATABASE_URL } from '../lib/config.js'

const {
  PORT = 8080,
  HOST = '127.0.0.1',
  SENTRY_ENVIRONMENT = 'development',
  REQUEST_LOGGING = 'true'
} = process.env

const pkg = JSON.parse(
  await fs.readFile(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'package.json'
    ),
    'utf8'
  )
)

Sentry.init({
  dsn: 'https://47b65848a6171ecd8bf9f5395a782b3f@o1408530.ingest.sentry.io/4506576125427712',
  release: pkg.version,
  environment: SENTRY_ENVIRONMENT,
  tracesSampleRate: 0.1
})

const pgPool = new pg.Pool({
  connectionString: DATABASE_URL,
  // allow the pool to close all connections and become empty
  min: 0,
  // this values should correlate with service concurrency hard_limit configured in fly.toml
  // and must take into account the connection limit of our PG server, see
  // https://fly.io/docs/postgres/managing/configuration-tuning/
  max: 100,
  // close connections that haven't been used for one second
  idleTimeoutMillis: 1000,
  // automatically close connections older than 60 seconds
  maxLifetimeSeconds: 60
})

pgPool.on('error', err => {
  // Prevent crashing the process on idle client errors, the pool will recover
  // itself. If all connections are lost, the process will still crash.
  // https://github.com/brianc/node-postgres/issues/1324#issuecomment-308778405
  console.error('An idle client has experienced an error', err.stack)
})

// Check that we can talk to the database
await pgPool.query('SELECT 1')

const logger = {
  error: console.error,
  info: console.info,
  request: ['1', 'true'].includes(REQUEST_LOGGING) ? console.info : () => {}
}

const handler = createHandler({
  pgPool,
  logger
})
const server = http.createServer(handler)
console.log('Starting the http server on host %j port %s', HOST, PORT)
server.listen(PORT, HOST)
await once(server, 'listening')
console.log(`http://${HOST}:${PORT}`)
