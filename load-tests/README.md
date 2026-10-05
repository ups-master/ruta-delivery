# Pruebas de carga (k6)

## Cómo correrlas: `run.sh` + un `.env` por entorno

Las mismas pruebas sirven contra el stack local, staging y producción, desde cualquier
máquina con Docker (k6 corre en el contenedor `grafana/k6`; `verify` además necesita
`python3`). El destino y la carga salen de un archivo `.env`, no del código:

```bash
cd entregas_disenio_de_apis
cp load-tests/env/staging.env.example load-tests/env/staging.env   # completa BASE_URL y credenciales
load-tests/run.sh smoke     load-tests/env/staging.env   # 1) valida conectividad, TLS y login
load-tests/run.sh sustained load-tests/env/staging.env   # 2) escenario (spike, breakpoint, dashboard-heavy)
load-tests/run.sh verify    load-tests/env/staging.env   # e2e de scripts/verify_delivery.py
```

Cada corrida imprime el destino y guarda el resumen en `load-tests/results/<env>-<escenario>-<fecha>.json`
(ignorado por git). Contra un destino que no es local, `sustained`, `spike`, `breakpoint`,
`dashboard-heavy` y `verify` piden confirmación (`ASSUME_YES=1` la omite, p. ej. en CI).

| Variable (en el `.env`) | Para qué |
|---|---|
| `BASE_URL` | **Obligatoria.** `https://api.midominio.com`, `https://<ip-ec2>` o `http://backend:8080` |
| `RUTA_ADMIN` / `RUTA_PASSWORD` | Admin del entorno (**obligatoria** la contraseña; la misma de `deploy/env/<entorno>.env` en la EC2) |
| `INSECURE_TLS` | `true` no verifica el certificado: necesario al ir directo a la EC2 con el Origin Certificate de Cloudflare |
| `LOAD_SCALE` | Multiplica VUs y tasas (`1` = perfil documentado abajo; `0.2` = 20 %). Las duraciones no cambian. Los escenarios con umbral `abortOnFail` (`breakpoint`) siguen cortando donde se crucen |
| `P95_MS` | Reemplaza el umbral de p(95) de cada escenario (útil si la latencia de red desde tu máquina es alta) |
| `USER_AGENT` | Por defecto `RutaLoadTest/1.0`: identificable en logs y en reglas de Cloudflare (el de k6 o `Python-urllib` por defecto lo pueden bloquear las reglas de bots) |
| `K6_DOCKER_NETWORK` | Solo local: red de Docker a la que unir k6 |
| `RUTA_DRIVER` / `RUTA_DRIVER_PASSWORD` | Solo `verify`: conductor del entorno (por defecto `conductor` / `conductor123`) |
| `RUTA_CHECK_FIXTURES` | Solo `verify`: `0` omite la comprobación de los datos del seed demo (59 facturas / 50 PIN); usa `0` si el entorno no se sembró con `demo/invoices.json` |

Sin comillas en los valores: `docker --env-file` no las quita.

### Contra la EC2 desde otra máquina

Dos formas de llegar, se elige con `BASE_URL`/`INSECURE_TLS`:

1. **Por el dominio (Cloudflare)** — el camino real de los usuarios: `BASE_URL=https://api.midominio.com`,
   `INSECURE_TLS=false`. Cloudflare puede desafiar o limitar mucho tráfico desde una sola IP
   (Bot Fight Mode, rate limiting), y eso contaminaría la medición: para `spike` y `breakpoint`
   crea una regla que omita esas protecciones para tu IP o usa la vía 2.
2. **Directo a la EC2** — `BASE_URL=https://<ip-o-dns-ec2>`, `INSECURE_TLS=true`. Requiere abrir
   el security group de la EC2 en 443 a la IP de la máquina de pruebas (y cerrarlo después).
   Saltarse Cloudflare también quita su capa de protección: no mides ese salto.

Recomendación: empezar por `smoke`, luego `LOAD_SCALE=0.1`–`0.2` e ir subiendo. Un perfil sin
escalar (150/750 VUs, hasta 10 000 req/s) contra una EC2 pequeña mide a la EC2, no a la app.
`verify` **escribe datos** (crea facturas `VERIFY/...` y confirma entregas) también en
producción; no borra lo que crea.

### Stack local (reproduce los resultados de abajo)

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/env/local.env up -d --build --wait
cp load-tests/env/local.env.example load-tests/env/local.env    # RUTA_PASSWORD = ADMIN_PASSWORD de deploy/env/local.env
load-tests/run.sh sustained load-tests/env/local.env
```

El backend no publica su puerto al host en el compose unificado (solo nginx lo hace, y nginx
no reenvía `/v3/api-docs` ni rutas fuera de `/api/`), así que en local k6 se une a la **red
de Docker Compose** (`K6_DOCKER_NETWORK=ruta-delivery-local_default`, que sale de
`COMPOSE_PROJECT_NAME`; con otro nombre de proyecto, ajustar). Los comandos `docker run`
de los resultados de abajo son equivalentes a `run.sh` con ese `.env`.

Todos los escenarios (`sustained.js`, `spike.js`, `breakpoint.js`, `dashboard-heavy.js`)
declaran `summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)']`, así
que tanto el resumen de consola como el `--summary-export` incluyen **p99** (antes solo se
reportaba hasta p95).

## Resultados locales (2026-09-27, `deploy/docker-compose.yml`, stack local, `DB_POOL_MAX_SIZE=10`)

### Carga sostenida (Load/Stress Testing)

0→150 VUs en 3 min, meseta de 150 VUs por 7 min, bajada a 0 en 2 min (dentro del rango
mínimo exigido: 100-200 VUs, ramp-up 2-3 min, meseta 5-10 min, ramp-down 1-2 min).

```bash
docker run --rm -i --network ruta-delivery-local_default -v "$PWD":/scripts \
  -e BASE_URL=http://backend:8080 -e RUTA_PASSWORD=<...> \
  grafana/k6 run --summary-export=/scripts/local/results-sustained.json /scripts/sustained.js
```

| Indicador | Resultado | Umbral | Cumple |
|---|---:|---:|---|
| Throughput | 639,5 req/s (511 381 peticiones) | — | — |
| Latencia promedio | 2,36 ms | — | — |
| p90 | 4,33 ms | — | — |
| p95 | 5,32 ms | < 500 ms | ✅ |
| **p99** | **7,05 ms** | — | — |
| Tasa de error | 0,00 % | < 1 % | ✅ |

![Throughput por escenario](local/graficas/throughput.png)
![Latencia por escenario](local/graficas/latencia.png)

### Pico extremo (Spike Testing)

0→750 VUs (10x la meseta sostenida) en 30s, meseta de 1 min, bajada a 0 en 30s (dentro del
rango mínimo exigido: 5-10x la carga normal, pico de 1-2 min).

```bash
docker run --rm -i --network ruta-delivery-local_default -v "$PWD":/scripts \
  -e BASE_URL=http://backend:8080 -e RUTA_PASSWORD=<...> \
  grafana/k6 run --summary-export=/scripts/local/results-spike.json /scripts/spike.js
```

| Indicador | Resultado | Umbral | Cumple |
|---|---:|---:|---|
| Throughput | 3 075,4 req/s (403 397 peticiones) | — | — |
| Latencia promedio | 2,42 ms | — | — |
| p90 | 4,39 ms | — | — |
| p95 | 5,54 ms | < 1000 ms | ✅ |
| **p99** | **12,19 ms** | — | — |
| Tasa de error | 0,00 % | — | ✅ |
| Estado del Circuit Breaker tras el spike | `CLOSED`, 0 llamadas rechazadas | — | Sin señal de saturación |

![Tasa de error por escenario](local/graficas/error_rate.png)

### Punto de ruptura (Breakpoint)

A diferencia de `sustained.js`/`spike.js` (que no se degradan ni con 750 VUs),
`breakpoint.js` sube la tasa de llegada sin techo (`ramping-arrival-rate`, 500→10 000
req/s objetivo) sobre la misma mezcla de endpoints, con `abortOnFail` en los umbrales de
error y de `p(95)<500ms`: en cuanto se cruza, k6 corta la prueba ahí mismo — ese es el
breakpoint real, no un número elegido a mano.

```bash
docker run --rm -i --network ruta-delivery-local_default -v "$PWD":/scripts \
  -e BASE_URL=http://backend:8080 -e RUTA_PASSWORD=<...> \
  grafana/k6 run --summary-export=/scripts/local/results-breakpoint-pool10.json /scripts/breakpoint.js
```

| Indicador | Resultado al momento del corte |
|---|---:|
| Throughput | 4 548,9 req/s |
| VUs activas | 1 311 (tope alcanzado en la etapa de 1500 iter/s) |
| p90 | 380,2 ms |
| **p95** | **601,4 ms (cruza el umbral de 500 ms)** |
| **p99** | **699,2 ms** |
| Tasa de error | 0,00 % (el sistema se degrada en latencia, no cae) |

![Throughput en el punto de quiebre](local/graficas/breakpoint_throughput.png)
![Latencia en el punto de quiebre](local/graficas/breakpoint_latencia.png)

**Lectura:** el sistema nunca devuelve errores bajo esta mezcla de tráfico; lo que ocurre
al superar ~4 500 req/s es que la latencia se degrada exponencialmente (p95 pasa de
single-digit ms a >600 ms) hasta cruzar el umbral. `local/results-breakpoint-pool10.json` es la
salida cruda de esta corrida.

### Nota histórica: efecto del pool de HikariCP (`local/results-breakpoint-before.json`/`-after.json`)

Una ronda anterior (2026-09-26) comparó el breakpoint con `DB_POOL_MAX_SIZE=10` (valor por
defecto) contra `DB_POOL_MAX_SIZE=30`, en otra máquina y sin p99 configurado (por eso esos
dos archivos no traen `p(99)` en sus métricas — quedan como lo que son, evidencia de esa
ronda, no repetida aquí):

| Indicador | Antes (pool=10) | Después (pool=30) |
|---|---:|---:|
| Throughput al corte | 5 658 req/s | 6 301 req/s (+11 %) |
| p95 al corte | 503 ms | 509 ms |
| Tasa de error | 0,00 % | 0,00 % |

Subir el pool movió el techo ~11-16 % más allá antes de degradarse; el resto del límite en
esa máquina era CPU del contenedor del backend, no la base de datos. Los tokens JWT que
esos dos JSON guardaban en `setup_data` se redactaron por higiene (no aportan al análisis
de rendimiento). El número exacto de corte varía con la máquina donde se corre — lo
importante y estable es el orden de magnitud (varios miles de req/s) y que el sistema se
degrada en latencia, nunca en errores.

## Resultados en producción (2026-10-01 y 2026-10-04, EC2 directo, sin Cloudflare)

Corridas de `run.sh` con `env/production.env`; el `LOAD_SCALE` va en el nombre del JSON de
`results/`. `sustained` con `LOAD_SCALE=1` serían 150 VUs. Los errores son las respuestas
que k6 cuenta como fallidas (código ≥ 400 o sin respuesta).

| Corrida | VUs máx | Peticiones | req/s | Prom. | med | p90 | p95 | p99 | max | Errores |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| smoke | 2 | 109 | 3,5 | — | 113,8 ms | 128,2 ms | 129,6 ms | 141,5 ms | 200 ms | 0 % |
| sustained 0.1 | 15 | 46 093 | 62,4 | — | 105,8 ms | 110,1 ms | 112,0 ms | 122,5 ms | 952 ms | 0 % |
| sustained 0.2 | 30 | 92 605 | 125,2 | — | 98,5 ms | 103,0 ms | 105,0 ms | 131,5 ms | 20 485 ms | 0 % |
| sustained 0.5 | 75 | 226 885 | 303,0 | — | 105,6 ms | 164,8 ms | **209,9 ms** | **346,6 ms** | 1 592 ms | 0 % |
| sustained 0.7 | 105 | 300 415 | 388,2 | 187,7 ms | 122,4 ms | 342,0 ms | **446,6 ms** | **707,5 ms** | 3 103 ms | **6,35 %** |
| spike 0.2 | 150 | 58 397 | 450,2 | 197,0 ms | 116,9 ms | 407,9 ms | 506,7 ms | 680,8 ms | 2 658 ms | **14,64 %** |
| spike 0.4 | 300 | 76 358 | 589,4 | 531,7 ms | 429,6 ms | 1 053,9 ms | 1 137,6 ms | 2 198,9 ms | 3 960 ms | **25,94 %** |
| breakpoint 0.1 | 75 | 44 502 | 368,5 | 134,1 ms | 98,0 ms | 191,2 ms | 289,4 ms | 505,1 ms | 2 941 ms | **1,49 %** (corte) |

Hasta 75 VUs (303 req/s) la EC2 responde sin errores. Con 105 VUs sostenidos el p95
(446,6 ms) todavía queda bajo 500 ms, pero el error pasa de 1 % (6,35 %). JSON (con el JWT
redactado) en `production/`; los originales de `results/` siguen ignorados por git.

![Throughput en producción](production/graficas/throughput.png)
![p95 en producción](production/graficas/p95.png)
![p99 en producción](production/graficas/p99.png)
![Tasa de error en producción](production/graficas/error_rate.png)
![Spike en producción](production/graficas/spike.png)

### Spike y breakpoint en producción

- **Spike (`spike.js`, 0→pico en 30 s, 1 min de meseta, bajada en 30 s).** Con `LOAD_SCALE=0.2`
  (pico de 150 VUs) y `0.4` (300 VUs) el sistema no cae, pero pierde peticiones: 14,64 % y
  25,94 % de error, y el p95 pasa de 507 ms a 1 138 ms (el segundo cruza el umbral de
  1 000 ms). El throughput aun así sube (450 → 589 req/s). No son los 5-10× de la carga
  normal que pide el enunciado: 300 VUs son 4× los 75 VUs que la instancia sostiene sin
  errores, y el spike completo (750 VUs, `LOAD_SCALE=1`) no se corrió en producción.
- **Los errores son 502 del nginx, no de la aplicación.** Los fallos del `check` (8 550 y
  19 805) coinciden con las peticiones fallidas: ninguna fue un 503 del Circuit Breaker. El
  log del nginx muestra `connect() to <backend>:8080 failed (99: Address not available)` y la
  respuesta `502`: el nginx no consigue abrir la conexión hacia el backend por agotamiento de
  puertos efímeros, porque abre una conexión nueva por petición (`proxy_pass` directo, sin
  `keepalive` ni HTTP/1.1 hacia el backend). Los `499` del log son peticiones que k6 cerró al
  cortar la prueba. Es una inferencia a partir del log y de la configuración; falta
  comprobarla aplicando `keepalive` y repitiendo la corrida.
- **Breakpoint (`breakpoint.js` con `LOAD_SCALE=0.1`).** `ramping-arrival-rate` cuenta
  *iteraciones* por segundo y cada iteración hace 6 peticiones, así que `0.1` arranca en 50
  iteraciones/s (~300 req/s), ya en el nivel que la instancia sostiene. La corrida se cortó
  sola (`abortOnFail`) a los ~2 min, con un error acumulado de 1,49 %; el p95 (289 ms) aún
  no era el problema. Confirma la saturación, pero no fija el punto exacto: para eso haría
  falta repetirlo con `LOAD_SCALE=0.03`-`0.05`.
- **Recuperación tras el pico.** Estas corridas no miden el estado posterior (el resumen
  agrega toda la prueba); el estado del Circuit Breaker se imprime en consola al terminar el
  spike y no se guardó en los JSON.

### Comparativa local vs producción (sustained)

![Local vs producción](comparativa/sustained_local_vs_produccion.png)

| | Local (150 VUs) | Producción (105 VUs, 0.7) |
|---|---:|---:|
| Throughput | 639,5 req/s | 388,2 req/s |
| p95 | 5,3 ms | 446,6 ms |
| p99 | 7,1 ms | 707,5 ms |
| Errores | 0 % | 6,35 % |

La diferencia de p95/p99 es sobre todo RTT de red (~100 ms) más la cola que aparece en la
EC2 desde 0.5; no es comparable 1 a 1 porque local corre en la red de Docker, en una
máquina de desarrollo con CPU holgada. Lo comparable es la forma: el local no llega a
degradarse con 750 VUs, y la EC2 empieza a perder peticiones entre 75 y 105 VUs.

**Lectura:**

- La latencia base es el RTT de red: el mínimo ronda 86-107 ms y el handshake ~105-110 ms.
  Hasta 30 VUs el backend aporta pocos ms.
- **La capacidad medida de esta instancia es ~300 req/s sin errores (75 VUs) y satura
  entre 303 y 388 req/s.** Con 0.5 aparece la primera degradación (p95 105→210 ms, p99
  131→347 ms, sin errores); con 0.7 el throughput deja de crecer linealmente (388 req/s
  frente a ~424 esperados) y empiezan los errores (6,35 %). Las peticiones perdidas
  son 502 del nginx al abrir la conexión hacia el backend (ver arriba); CPU de la EC2,
  memoria del contenedor de 1 GB y pool Hikari/RDS **no están medidos**, así que no se sabe
  cuál limitaría después.
- A diferencia del local, aquí **sí hay errores**, no solo latencia: el sistema pasa de
  degradarse con cola a rechazar o perder peticiones al superar su capacidad.
- Hay outliers aislados (20,5 s en una petición de la corrida 0.2; bloqueos de conexión de
  ~1,1 s por posibles retransmisiones de SYN).
- Desde esta ronda `sustained.js`, `spike.js` y `breakpoint.js` agrupan las peticiones del
  tablero con `tags: { name: ... }` (antes `from`/`to` creaban una serie de métricas por URL
  y k6 avisaba de 200 mil series). El resumen exportado no incluye la latencia por endpoint
  salvo que se declaren umbrales sobre esa etiqueta; sigue pendiente confirmar qué ruta
  genera la cola.
- Frente al enunciado: la sostenida llegó a 105 VUs en producción (rango 100-200), pero con
  error de 6,35 % (se pide < 1 %); el spike llegó a 300 VUs (4×, no 5-10×); el breakpoint
  se corrió y cortó, sin fijar el punto exacto. El perfil completo (150 VUs sostenidos,
  750 en spike) corresponde a la ejecución local.

### Cómo leer estos números: es un monolito, la carga no se distribuye

La app es un **monolito desplegado como una sola instancia**: un contenedor `backend` (una
JVM, `mem_limit` 1 GB por defecto), un `nginx` delante y una EC2. Según
`deploy/env/production.env.example` la base de datos es RDS, un servicio aparte, pero todo
el código de negocio corre en un único proceso. No hay balanceador ni réplicas, así que **el
100 % del tráfico cae en el mismo nodo** y comparte sus recursos:

- **Una sola capacidad que medir.** Lo que miden estas pruebas es lo que aguanta *una*
  instancia (CPU de la EC2, hilos de Tomcat, heap de la JVM, pool de Hikari de 10
  conexiones por defecto). Nada reparte la carga ni absorbe el exceso, por eso al acercarse
  al límite lo que se ve es una **cola** (p95 y p99 suben antes que la mediana), no errores.
  Es el patrón esperado de un nodo único: se degrada de forma gradual hasta saturarse.
- **Los endpoints se pisan entre sí.** Cada iteración pide seis rutas (búsqueda de facturas,
  historial, mapa, métricas, costo y estado del Circuit Breaker) y todas usan el mismo
  pool y la misma CPU. Las agregaciones del tablero (`/dashboard/map` y `/metrics`) compiten
  con las lecturas ligeras; en una arquitectura de servicios separados la ruta pesada no
  afectaría a las demás. Hoy el resumen de k6 no separa la latencia por endpoint, así que
  no se puede atribuir la cola a una ruta concreta (ver pendientes).
- **Por qué el local aguantó ~4 500 req/s y la EC2 menos.** Ambos son un solo nodo, pero el
  local es una máquina de desarrollo con CPU holgada y sin red de por medio; la EC2 es una
  instancia mucho más pequeña con ~100 ms de RTT. La comparación mide *tamaño de nodo*, no
  un cambio de arquitectura.
- **El generador también es un solo punto.** k6 corre desde una única máquina y una única
  ruta de red, así que parte de la cola y de los outliers de conexión puede venir del lado
  del cliente y no del servidor.

**Qué implica para escalar.** Con un monolito de una instancia, la salida inmediata es
**vertical** (más vCPU/RAM, subir `DB_POOL_MAX_SIZE`; en la ronda local pasar el pool de 10
a 30 movió el techo ~11 %). Escalar **horizontalmente** (varias réplicas detrás de un
balanceador) es viable porque la sesión viaja en una cookie JWT sin estado en el servidor,
pero hay estado local por instancia que habría que revisar antes: la caché Caffeine y el rate
limiting de bucket4j (login y `/confirm`) viven en memoria de cada réplica, así que con
varias los límites se multiplicarían y las cachés dejarían de ser coherentes entre sí.
Estos resultados sirven como línea base de capacidad *por instancia* para dimensionar eso:
~300 req/s con p95 ≈ 210 ms y error 0 % en esta EC2; por encima de ~390 req/s empiezan los errores.

## Gráficas y carpetas

- `local/` — resultados y gráficas del stack local (`local/graficas/`, `local/results-*.json`).
- `production/` — resultados (JWT redactado) y gráficas de la EC2 (`production/graficas/`).
- `comparativa/` — local vs producción.
- `generar_graficas.py` regenera `production/graficas/` y `comparativa/` (requiere matplotlib).
  Las de `local/graficas/` se generaron aparte (SVG→PNG) y no las regenera este script.

## Qué no se prueba y por qué

`POST /api/v1/driver/deliveries/confirm` no está incluido: cada factura solo se puede
confirmar una vez (regla real del dominio, no una limitación de la prueba), así que no hay
forma de repetirlo miles de veces sin generar una factura nueva por cada llamada. Se
prueban en cambio los endpoints de lectura, que reciben la mayor parte del tráfico real.

`dashboard-heavy.js` (tablero administrativo bajo un dataset de 500 entregas confirmadas
con foto real de ~200KB, ver `docs/EVALUACION_TECNICA.md` §9 para el hallazgo histórico
p95 21,91s→13,33ms) ya tiene `summaryTrendStats` con p99 agregado, pero no se volvió a
correr en esta ronda: no es uno de los escenarios mínimos que exige el enunciado (que pide
sostenida + spike), y requiere sembrar el dataset pesado de nuevo
(`scripts/generate_invoices.py` + `scripts/seed_confirmed_deliveries.py`) antes de medir.
