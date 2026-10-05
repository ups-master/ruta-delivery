// Spike test: 0 -> 750 VUs (5x los 150 VUs de la meseta sostenida) en 10 s, meseta de
// 1 min 30 s y bajada inmediata (5 s) a 0. Mismos endpoints de lectura que sustained.js.
// Despues del pico corre un escenario de recuperacion (5 VUs fijos durante 2 min, etiqueta
// phase:recovery) para comprobar si el sistema vuelve solo a su estado normal o queda
// degradado: sus umbrales sobre http_req_failed/http_req_duration{phase:recovery} hacen que
// la recuperacion aparezca en el resumen exportado. El estado del Circuit Breaker
// (/api/v1/admin/resilience/status) se consulta al final (no se fuerza a que se abra: si no
// hay evidencia, se reporta como tal).
import http from 'k6/http'
import { check, sleep } from 'k6'
import { login } from './auth.js'
import { BASE_URL, baseOptions, p95Threshold, scaled, statusThresholds } from './config.js'

export const options = baseOptions({
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: scaled(750) },
        { duration: '1m30s', target: scaled(750) },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '0s',
      tags: { phase: 'peak' },
    },
    recovery: {
      executor: 'constant-vus',
      vus: 5,
      duration: '2m',
      startTime: '1m50s',
      tags: { phase: 'recovery' },
    },
  },
  thresholds: {
    'http_req_duration{phase:peak}': [p95Threshold(1000)],
    'http_req_failed{phase:peak}': ['rate>=0'],
    'http_req_duration{phase:recovery}': [p95Threshold(500)],
    'http_req_failed{phase:recovery}': ['rate<0.01'],
    ...statusThresholds(),
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
