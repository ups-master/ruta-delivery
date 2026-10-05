// Carga sostenida: 0 -> 150 VUs en 3 min, meseta de 150 VUs por 7 min, bajada a 0 en 2 min.
// Contra endpoints de lectura reales (busqueda de facturas, historial, tablero, costo,
// estado del circuit breaker). No incluye POST /api/v1/driver/deliveries/confirm: cada
// factura solo se puede confirmar una vez (idempotencia real del dominio), asi que no
// hay forma de repetirlo miles de veces sin fabricar facturas nuevas por iteracion; se
// deja fuera en vez de fingir que se probo.
import http from 'k6/http'
import { check, sleep } from 'k6'
import { login } from './auth.js'
import { BASE_URL, baseOptions, p95Threshold, scaled, statusThresholds } from './config.js'

export const options = baseOptions({
  scenarios: {
    sustained: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '3m', target: scaled(150) },
        { duration: '7m', target: scaled(150) },
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: [p95Threshold(500)],
    http_req_failed: ['rate<0.01'],
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
  const month = now.toISOString().slice(0, 7)

  const responses = http.batch([
    ['GET', `${BASE_URL}/api/v1/driver/invoices?q=001`, null, { headers }],
    ['GET', `${BASE_URL}/api/v1/admin/deliveries?page=0&size=20`, null, { headers }],
    ['GET', `${BASE_URL}/api/v1/admin/dashboard/map?from=${from}&to=${to}`, null, { headers, tags: { name: 'GET /admin/dashboard/map' } }],
    ['GET', `${BASE_URL}/api/v1/admin/dashboard/metrics?from=${from}&to=${to}`, null, { headers, tags: { name: 'GET /admin/dashboard/metrics' } }],
    ['GET', `${BASE_URL}/api/v1/admin/cost?month=${month}`, null, { headers }],
    ['GET', `${BASE_URL}/api/v1/admin/resilience/status`, null, { headers }],
  ])

  responses.forEach((res) => check(res, { 'status is 200': (r) => r.status === 200 }))
  sleep(1)
}
