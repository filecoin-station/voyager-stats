/**
 * @param {import('pg').Pool} pgPool
 * @param {import('./typings').Filter} filter
 */
export const fetchRetrievalSuccessRate = async (pgPool, filter) => {
  // Fetch the "day" (DATE) as a string (TEXT) to prevent node-postgres for converting it into
  // a JavaScript Date with a timezone, as that could change the date one day forward or back.
  const { rows } = await pgPool.query(`
    SELECT day::text, SUM(total) as total, SUM(successful) as successful
    FROM retrieval_stats
    WHERE day >= $1 AND day <= $2
    GROUP BY day
    `, [
    filter.from,
    filter.to
  ])
  const stats = rows.map(r => ({
    day: r.day,
    success_rate: r.total > 0 ? r.successful / r.total : null
  }))
  return stats
}

/**
 * @param {import('pg').Pool} pgPool
 * @param {import('./typings').Filter} filter
 */
export const fetchDailyParticipants = async (pgPool, filter) => {
  // Fetch the "day" (DATE) as a string (TEXT) to prevent node-postgres from converting it into
  // a JavaScript Date with a timezone, as that could change the date one day forward or back.
  const { rows } = await pgPool.query(`
    SELECT day::TEXT, COUNT(DISTINCT participant_id)::INT as participants
    FROM daily_participants
    WHERE day >= $1 AND day <= $2
    GROUP BY day
    `, [
    filter.from,
    filter.to
  ])
  return rows
}

/**
 * @param {import('pg').Pool} pgPool
 * @param {import('./typings').Filter} filter
 */
export const fetchMonthlyParticipants = async (pgPool, filter) => {
  // Fetch the "day" (DATE) as a string (TEXT) to prevent node-postgres from converting it into
  // a JavaScript Date with a timezone, as that could change the date one day forward or back.
  const { rows } = await pgPool.query(`
    SELECT
      date_trunc('month', day)::DATE::TEXT as month,
      COUNT(DISTINCT participant_id)::INT as participants
    FROM daily_participants
    WHERE
      day >= date_trunc('month', $1::DATE)
      AND day < date_trunc('month', $2::DATE) + INTERVAL '1 month'
    GROUP BY month
    `, [
    filter.from,
    filter.to
  ])
  return rows
}

/**
 * @param {import('pg').Pool} pgPool
 * @param {import('./typings').Filter} filter
 */
export const fetchMinersRSRSummary = async (pgPool, filter) => {
  const { rows } = await pgPool.query(`
    SELECT miner_id, SUM(total) as total, SUM(successful) as successful
    FROM retrieval_stats
    WHERE day >= $1 AND day <= $2
    GROUP BY miner_id
   `, [
    filter.from,
    filter.to
  ])
  const stats = rows.map(r => ({
    miner_id: r.miner_id,
    success_rate: r.total > 0 ? r.successful / r.total : null
  }))
  return stats
}
