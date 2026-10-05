// Configuracion compartida por todos los escenarios, leida de variables de entorno para
// poder correr las mismas pruebas contra cualquier despliegue (local, staging, produccion,
// la EC2 detras de Cloudflare o directo a su IP) desde cualquier maquina. Ver run.sh y
// env/*.env.example para el juego completo de variables.
//
//   BASE_URL      (obligatoria) https://api.midominio.com, https://<ip-ec2>, http://backend:8080...
//   INSECURE_TLS  "true" -> no verifica el certificado (ir directo a la EC2, cuyo Origin
//                 Certificate de Cloudflare no es publico)
//   LOAD_SCALE    factor que multiplica VUs y tasas de llegada (1 = perfil documentado;
//                 0.2 = 20 %, para una EC2 pequena). Las duraciones no cambian.
//   P95_MS        reemplaza el umbral de p(95) de cada escenario (util con latencia de red)
//   USER_AGENT    por defecto "RutaLoadTest/1.0" (identificable en logs y reglas de Cloudflare)

function required(name) {
  const value = __ENV[name]
  if (!value) {
    throw new Error(`Falta la variable ${name}. Usa load-tests/run.sh <escenario> <archivo.env> (ver load-tests/env/*.env.example).`)
  }
  return value
}

function positiveNumber(name, fallback) {
  const raw = __ENV[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} debe ser un numero mayor que 0 (recibido: "${raw}").`)
  }
  return value
}

export const BASE_URL = required('BASE_URL').replace(/\/+$/, '')
export const LOAD_SCALE = positiveNumber('LOAD_SCALE', 1)

// Escala un target de VUs o de tasa. El 0 de las bajadas finales se conserva; cualquier
// otro valor queda como minimo en 1 para que el escenario siga generando carga.
export function scaled(n) {
  return n === 0 ? 0 : Math.max(1, Math.round(n * LOAD_SCALE))
}

// Umbral de p(95): P95_MS lo reemplaza; si no, el que tiene cada escenario por defecto.
export function p95Threshold(defaultMs) {
  return `p(95)<${positiveNumber('P95_MS', defaultMs)}`
}

// Umbrales "de visibilidad" (siempre se cumplen): k6 solo exporta en --summary-export los
// submetricos que tienen umbral, asi que declararlos produce en el JSON el conteo de
// peticiones por codigo HTTP (status 0 = sin respuesta: tiempo agotado o conexion cerrada).
export function statusThresholds(codes = [200, 401, 403, 429, 500, 502, 503, 504, 0]) {
  const thresholds = {}
  codes.forEach((code) => {
    thresholds[`http_reqs{status:${code}}`] = ['count>=0']
  })
  return thresholds
}

export function baseOptions(extra) {
  return Object.assign(
    {
      summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
      userAgent: __ENV.USER_AGENT || 'RutaLoadTest/1.0',
      insecureSkipTLSVerify: __ENV.INSECURE_TLS === 'true',
    },
    extra
  )
}
