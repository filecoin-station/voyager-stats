import assert from 'http-assert'
import { json } from 'http-responders'
import Sentry from '@sentry/node'
import { URLSearchParams } from 'node:url'

import {
  fetchDailyParticipants,
  fetchMonthlyParticipants,
  fetchRetrievalSuccessRate
} from './stats-fetchers.js'

/**
 * @param {object} args
 * @param {import('pg').Pool} args.pgPool
 * @param {import('./typings').Logger} args.logger
 * @returns
 */
export const createHandler = ({
  pgPool,
  logger
}) => {
  return (req, res) => {
    const start = new Date()
    logger.request(`${req.method} ${req.url} ...`)
    handler(req, res, pgPool)
      .catch(err => errorHandler(res, err, logger))
      .then(() => {
        logger.request(`${req.method} ${req.url} ${res.statusCode} (${new Date() - start}ms)`)
      })
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {import('pg').Pool} pgPool
 */
const handler = async (req, res, pgPool) => {
  // Caveat! `new URL('//foo', 'http://127.0.0.1')` would produce "http://foo/" - not what we want!
  const { pathname, searchParams } = new URL(`http://127.0.0.1${req.url}`)
  const segs = pathname.split('/').filter(Boolean)
  if (req.method === 'GET' && segs[0] === 'retrieval-success-rate' && segs.length === 1) {
    await getStatsWithFilterAndCaching(
      pathname,
      searchParams,
      res,
      pgPool,
      fetchRetrievalSuccessRate)
  } else if (req.method === 'GET' && segs[0] === 'participants' && segs[1] === 'daily' && segs.length === 2) {
    await getStatsWithFilterAndCaching(
      pathname,
      searchParams,
      res,
      pgPool,
      fetchDailyParticipants)
  } else if (req.method === 'GET' && segs[0] === 'participants' && segs[1] === 'monthly' && segs.length === 2) {
    await getStatsWithFilterAndCaching(
      pathname,
      searchParams,
      res,
      pgPool,
      fetchMonthlyParticipants)
  } else if (req.method === 'GET' && segs.length === 0) {
    // health check - required by Grafana datasources
    res.end('OK')
  } else {
    notFound(res)
  }
}

const errorHandler = (res, err, logger) => {
  if (err instanceof SyntaxError) {
    res.statusCode = 400
    res.end('Invalid JSON Body')
  } else if (err.statusCode) {
    res.statusCode = err.statusCode
    res.end(err.message)
  } else {
    logger.error(err)
    res.statusCode = 500
    res.end('Internal Server Error')
  }

  if (res.statusCode >= 500) {
    Sentry.captureException(err)
  }
}

const notFound = (res) => {
  res.statusCode = 404
  res.end('Not Found')
}

const getDayAsISOString = (d) => d.toISOString().split('T')[0]

export const today = () => getDayAsISOString(new Date())

/**
 * @param {string} pathname
 * @param {URLSearchParams} searchParams
 * @param {import('node:http').ServerResponse} res
 * @param {import('pg').Pool} pgPool
 * @param {(import('pg').Pool, import('./typings').Filter) => Promise<object[]>} fetchStatsFn
 */
const getStatsWithFilterAndCaching = async (pathname, searchParams, res, pgPool, fetchStatsFn) => {
  let from = searchParams.get('from')
  let to = searchParams.get('to')
  let shouldRedirect = false

  // Provide default values for "from" and "to" when not specified

  if (!to) {
    to = today()
    shouldRedirect = true
  }
  if (!from) {
    from = to
    shouldRedirect = true
  }
  if (shouldRedirect) {
    res.setHeader('cache-control', `public, max-age=${600 /* 10min */}`)
    res.setHeader('location', `${pathname}?${new URLSearchParams({ from, to })}`)
    res.writeHead(302) // Found
    res.end()
    return { from, to }
  }

  // Trim time from date-time values that are typically provided by Grafana

  const matchFrom = from.match(/^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}:\d{2}\.\d{3}Z)?$/)
  assert(matchFrom, 400, '"from" must have format YYYY-MM-DD or YYYY-MM-DDThh:mm:ss.sssZ')
  if (matchFrom[2]) {
    from = matchFrom[1]
    shouldRedirect = true
  }

  const matchTo = to.match(/^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}:\d{2}\.\d{3}Z)?$/)
  assert(matchTo, 400, '"to" must have format YYYY-MM-DD or YYYY-MM-DDThh:mm:ss.sssZ')
  if (matchTo[2]) {
    to = matchTo[1]
    shouldRedirect = true
  }

  if (shouldRedirect) {
    res.setHeader('cache-control', `public, max-age=${24 * 3600 /* one day */}`)
    res.setHeader('location', `${pathname}?${new URLSearchParams({ from, to })}`)
    res.writeHead(301) // Found
    res.end()
    return { from, to }
  }

  // We have well-formed from & to dates now, let's fetch the requested stats from the DB
  const filter = { from, to }
  const stats = await fetchStatsFn(pgPool, filter)
  setCacheControlForStatsResponse(res, filter)
  json(res, stats)
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {import('./typings').Filter} filter
 */
const setCacheControlForStatsResponse = (res, filter) => {
  // We cannot simply compare filter.to vs today() because there may be a delay in finalizing
  // stats for the previous day. Let's allow up to one hour for the finalization.
  const boundary = getDayAsISOString(new Date(Date.now() - 3600_000))

  if (filter.to >= boundary) {
    // response includes partial data for today, cache it for 10 minutes only
    res.setHeader('cache-control', 'public, max-age=600')
  } else {
    // historical data should never change, cache it for one year
    res.setHeader('cache-control', `public, max-age=${365 * 24 * 3600}, immutable`)
  }
}
