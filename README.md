# spark-stats

API exposing public statistics about Spark

## Development

### Database

Set up [PostgreSQL](https://www.postgresql.org/) with default settings:
 - Port: 5432
 - User: _your system user name_
 - Password: _blank_
 - Database: spark_public

Alternatively, set the environment variable `$DATABASE_URL` with
`postgres://${USER}:${PASS}@${HOST}:${POST}/${DATABASE}`.

The Postgres user and database need to exist already, and the user
needs full management permissions for the database.

You can also run the following command to set up the PostgreSQL server via Docker:

```bash
docker run -d --name spark-db \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_USER=$USER \
  -e POSTGRES_DB=spark_public \
  -p 5432:5432 \
  postgres
```

Finally, run database schema migration scripts from spark-evaluate.

```bash
npm run migrate
```

### Run the test suite

```sh
npm test
```

### Run the service

```sh
npm start
```

You can also run the service against live data in Spark DB running on Fly.io.

1. Set up a proxy to forward connections to Spark DB Postgres. Connect to the reader replica running
  on port 5433 (not 5432).

  The command below will forward connections to local post 5455 to Spark DB's reader replica.

  ```
  fly proxy 5455:5433 -a spark-db
  ```

2. Start the service and configure the database connection string to use the proxied connection.
  Look up the user and the password in our shared 1Password vault.

  ```
  DATABASE_URL="postgres://user:password@localhost:5455/spark_public" npm start
  ```

## Deployment

```
git push
```
