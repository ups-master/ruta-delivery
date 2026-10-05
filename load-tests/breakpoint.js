// Busca el breakpoint de los endpoints de lectura ligeros (Fase8): a diferencia de
// sustained.js/spike.js (que se quedan cortos con 150/750 VUs, sin degradarse nunca),
// este escenario sube la tasa de llegada de peticiones sin techo hasta que
// http_req_failed o p(95) cruzan el umbral (abortOnFail), y ese punto de quiebre es el
// breakpoint real del sistema para esta mezcla de trafico, no un numero elegido a mano.
import http from 'k6/http'
import { check } from 'k6'
import { login } from './auth.js'
import { BASE_URL, baseOptions, p95Threshold, scaled } from './config.js'

export const options = baseOptions({
  scenarios: {
    breakpoint: {
      executor: 'ramping-arrival-rate',
      startRate: scaled(500),
      timeUnit: '1s',
      preAllocatedVUs: scaled(200),
      maxVUs: scaled(4000),
      stages: [
        { duration: '1m', target: scaled(500) },
        { duration: '1m', target: scaled(1500) },
        { duration: '1m', target: scaled(3000) },
        { duration: '1m', target: scaled(5000) },
        { duration: '1m', target: scaled(8000) },
        { duration: '1m', target: scaled(10000) },
      ],
    },
  },
  thresholds: {
    // abortOnFail: en cuanto se cruza el umbral, k6 corta el escenario y reporta a que
    // tasa de llegada ocurrio -- ese es el breakpoint que "Rendimiento y pruebas de
    // carga" (§9 de EVALUACION_TECNICA.md) senalaba como no identificado.
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true }],
    http_req_duration: [{ threshold: p95Threshold(500), abortOnFail: true }],
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

  // Misma mezcla de endpoints que sustained.js/spike.js, para que el breakpoint
  // encontrado aqui sea comparable con esos dos escenarios.
  const responses = http.batch([
    ['GET', `${BASE_URL}/api/v1/driver/invoices?q=001`, null, { headers }],
    ['GET', `${BASE_URL}/api/v1/admin/deliveries?page=0&size=20`, null, { headers }],
    ['GET', `${BASE_URL}/api/v1/admin/dashboard/map?from=${from}&to=${to}`, null, { headers, tags: { name: 'GET /admin/dashboard/map' } }],
    ['GET', `${BASE_URL}/api/v1/admin/dashboard/metrics?from=${from}&to=${to}`, null, { headers, tags: { name: 'GET /admin/dashboard/metrics' } }],
    ['GET', `${BASE_URL}/api/v1/admin/cost?month=${month}`, null, { headers }],
    ['GET', `${BASE_URL}/api/v1/admin/resilience/status`, null, { headers }],
  ])

  responses.forEach((res) => check(res, { 'status is 200': (r) => r.status === 200 }))
}
