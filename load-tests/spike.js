// Spike test: 0 -> 750 VUs (~10x los 75 VUs de meseta habitual en un dia normal) en 30s,
// meseta corta de 1 min, bajada rapida a 0 en 30s. Mismos endpoints de lectura que
// sustained.js. El estado del Circuit Breaker (/api/v1/admin/resilience/status) se consulta
// al final para ver si el pico dejo evidencia real de saturacion (no se fuerza a que se
// abra: si no hay evidencia, se reporta como tal).
import http from 'k6/http'
import { check, sleep } from 'k6'
import { login } from './auth.js'
import { BASE_URL, baseOptions, p95Threshold, scaled } from './config.js'

export const options = baseOptions({
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: scaled(750) },
        { duration: '1m', target: scaled(750) },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: [p95Threshold(1000)],
  },
})

export function setup() {
  return { headers: login(BASE_URL, http) }
}

export default function (data) {
  const headers = data.headers
  const now = new Date()
  const from = new Date(now.getTime() - 30 * 86400000).toISOString()
  const to = now.toISOString()

  const responses = http.batch([
    ['GET', `${BASE_URL}/api/v1/driver/invoices?q=001`, null, { headers }],
    ['GET', `${BASE_URL}/api/v1/admin/deliveries?page=0&size=20`, null, { headers }],
    ['GET', `${BASE_URL}/api/v1/admin/dashboard/map?from=${from}&to=${to}`, null, { headers, tags: { name: 'GET /admin/dashboard/map' } }],
  ])

  responses.forEach((res) => check(res, { 'status is 200 or 503': (r) => r.status === 200 || r.status === 503 }))
  sleep(0.5)
}

export function teardown(data) {
  const status = http.get(`${BASE_URL}/api/v1/admin/resilience/status`, { headers: data.headers })
  console.log(`Estado del circuit breaker tras el spike: ${status.body}`)
}
