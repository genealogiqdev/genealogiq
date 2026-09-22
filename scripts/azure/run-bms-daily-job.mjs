const url = process.env.BMS_DAILY_JOB_URL
const secret = process.env.CRON_SECRET

if (!url || !secret) {
  console.error('BMS_DAILY_JOB_URL and CRON_SECRET are required')
  process.exit(1)
}

const response = await fetch(url, {
  headers: { authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(10 * 60 * 1000),
})

const body = await response.text()
if (!response.ok) {
  console.error(`BMS daily job failed with HTTP ${response.status}: ${body}`)
  process.exit(1)
}

console.log(body)
