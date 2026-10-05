# DOCUMENTO DE DESARROLLO, SEGURIDAD, CALIDAD Y DESPLIEGUE DE LA API

**Plataforma interna de verificación de entregas para la empresa de retail analizada**

## Fase 4 - Desarrollo, Seguridad y Despliegue (RA4)

| Campo | Información |
|---|---|
| **Autores** | Aliatis Enzo<br>Cadme Mauro<br>Murillo Jordan<br>Suárez Galo |
| **Asignatura** | Patrones de Diseño de APIs |
| **Docente** | Patsy Malena Prieto Vélez |
| **Versión** | 1.0 |
| **Fecha** | 28 de septiembre de 2026 |
| **Estado** | Para revisión |

> **Nota de trabajo.** Este documento reúne, como entregable propio de la Fase 4, la
> evidencia de los cuatro puntos que pide el enunciado (seguridad, calidad, rendimiento y
> DevOps). El detalle exhaustivo de cada verificación, con comandos y salidas reales, vive
> en `docs/EVALUACION_TECNICA.md`; aquí se cita puntualmente en vez de duplicarlo.

---

## Contenido

1. [Seguridad: autenticación y autorización](#1-seguridad-autenticación-y-autorización)
2. [Calidad: pruebas unitarias y cobertura](#2-calidad-pruebas-unitarias-y-cobertura)
3. [Rendimiento: pruebas de carga y estrés](#3-rendimiento-pruebas-de-carga-y-estrés)
4. [DevOps: despliegue en contenedores](#4-devops-despliegue-en-contenedores)
5. [Conclusión](#5-conclusión)

---

## 1. Seguridad: autenticación y autorización

La API usa **JWT** (no OAuth 2.0 completo, decisión de diseño para un sistema interno de
un solo cliente, justificada en `docs/Fase2_Arquitectura_Patrones_API.md` §4.5): el login
(`POST /api/v1/auth/login`) valida credenciales contra BCrypt y emite un JWT firmado con
HMAC-SHA256, con expiración configurable (480 minutos).

- **Transporte del token — cookie `HttpOnly`, no `localStorage`.** El token no viaja en el
  cuerpo de la respuesta ni se lee desde JavaScript: `AuthController.setAuthCookie` lo fija
  como cookie `access_token` (`HttpOnly`, `Secure` fuera de local, `SameSite`), y el
  frontend llama con `axios` en modo `withCredentials: true`, sin adjuntar ningún header
  `Authorization`. Esto cierra la superficie de robo de token vía XSS que señalaban
  revisiones anteriores del proyecto.
- **Autorización por rol en el backend**, no solo en el cliente: `SecurityConfig` exige
  `ROLE_ADMIN` en `/api/v1/admin/**` y admite `ADMIN`/`CONDUCTOR` en `/api/v1/driver/**`;
  `JwtAuthenticationFilter` bloquea de inmediato a un usuario desactivado
  (`userDetails.isEnabled()`).
- **Contraseñas** con BCrypt (`PasswordEncoderConfig`); ni `JWT_SECRET` ni
  `ADMIN_PASSWORD` pueden quedar en su valor de ejemplo fuera del modo demo
  (`SecretsGuardRunner`, ver §7 de `EVALUACION_TECNICA.md`).
- **Rate limiting del login**: `LoginRateLimiter` (bucket4j + Caffeine) bloquea tras 5
  intentos fallidos por IP+usuario en 60s, resetea el cupo tras un login exitoso y no se
  evade reescribiendo `X-Forwarded-For` a través del nginx real (verificado en vivo,
  `EVALUACION_TECNICA.md` §19/§21).
- **Cabeceras de seguridad y CSP** reales en la respuesta del frontend
  (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y
  una `Content-Security-Policy` acotada a lo que la app usa de verdad — OCR con
  WebAssembly, mapas Leaflet, Google Fonts), verificadas con navegador real en los flujos
  de login, tablero, OCR del conductor y descarga de evidencia.
- **PIN de entrega**: se bloquea la factura tras 5 intentos fallidos consecutivos
  (5 minutos). Se guarda en texto plano por una decisión de negocio explícita, no una
  omisión: Fase 1 §3 exige que la administración pueda leerlo para comunicarlo al cliente.
- **Documentación de la API (Swagger UI / OpenAPI)**: `/swagger-ui` y `/v3/api-docs` se
  publican a través del Nginx de borde con Basic Auth (`auth_basic` + `htpasswd`,
  `deploy/nginx/snippets/api-docs.conf`). El archivo `deploy/secrets/docs.htpasswd` queda
  fuera de git y, si falta, esas rutas responden 401 (cerradas por defecto) sin afectar a
  `/api/` ni a `/healthz`. El backend las deja sin JWT porque no es alcanzable sin pasar por
  Nginx. `springdoc.swagger-ui.csrf.enabled` hace que "Try it out" envíe `X-XSRF-TOKEN`,
  coherente con el CSRF de doble cookie. Verificado con Nginx real: 401 sin credenciales o
  con clave errónea, 200 con la correcta.
  En el Nginx de la API la raíz `/` redirige (302) a `/swagger-ui/index.html`, de modo que abrir
  el dominio de la API en el navegador lleva a la documentación; las demás rutas no definidas siguen en 404.
- **Content-Security-Policy en el Nginx de la API** (`deploy/nginx/snippets/csp-map.conf`),
  distinta por ruta y enviada desde el nivel `server` para no perder el HSTS: `/api/**`
  (solo JSON) con `default-src 'none'; frame-ancestors 'none'`, y Swagger UI / `/v3/api-docs`
  con `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (React inyecta atributos
  `style`), `img-src`/`font-src` con `data:` y `connect-src 'self'`; `unsafe-inline` nunca
  en scripts. Sin recursos externos (`springdoc.swagger-ui.validator-url=none` desactiva el
  validador de swagger.io). Verificado en Chrome contra el stack real: Swagger carga completo,
  sin violaciones de CSP, y desde "Try it out" el login responde 200 y el logout 204 (con CSRF).

El esquema de seguridad se declara en el propio contrato OpenAPI
(`docs/openapi.json`, `components.securitySchemes.sessionCookie`) como una `apiKey` en la
cookie `access_token`, coherente con la implementación real.

## 2. Calidad: pruebas unitarias y cobertura

- **Backend:** 136 pruebas (`mvn test`, BUILD SUCCESS, ejecutadas en un contenedor Maven
  limpio con Testcontainers, incluidas pruebas de integración reales contra un PostgreSQL
  real — bloqueo de PIN, concurrencia con `SELECT ... FOR UPDATE`, caché real, escape de
  comodines en la búsqueda). Cobertura JaCoCo: **~80 % de instrucciones**, ~58% de ramas.
- **Frontend:** 25 pruebas con Vitest + Testing Library (`apiClient`, interceptores de
  sesión/401, páginas de administración).
- El detalle por clase y por ronda de mejora está en `docs/EVALUACION_TECNICA.md` §8/§16.

## 3. Rendimiento: pruebas de carga y estrés

Herramienta: **k6** (`load-tests/`), contra el stack real levantado con
`docker compose -f deploy/docker-compose.yml --env-file deploy/env/local.env up -d --build --wait`.
Las secciones 3.1 a 3.4 corresponden al stack local; la 3.5 agrega las corridas contra la
EC2 de producción y la comparativa. Se ejecutaron los dos escenarios mínimos que exige el enunciado, más un tercero
(`breakpoint.js`) para identificar el punto de ruptura con precisión en vez de solo
describir que "no se degradó" dentro del rango probado.

### 3.1 Carga sostenida (Load/Stress Testing)

0→150 VUs en 3 min, meseta de 150 VUs por 7 min, bajada a 0 en 2 min — dentro del rango
que pide el enunciado (100-200 VUs, ramp-up 2-3 min, meseta 5-10 min, ramp-down 1-2 min).
**639,5 req/s, p95 = 5,32 ms, p99 = 7,05 ms, 0,00 % de error** (511 381 peticiones).

### 3.2 Pico extremo (Spike Testing)

0→750 VUs (10x la meseta sostenida) en 30s, meseta de 1 min, bajada a 0 en 30s — dentro
del rango que pide el enunciado (5-10x la carga normal, pico de 1-2 min).
**3 075,4 req/s, p95 = 5,54 ms, p99 = 12,19 ms, 0,00 % de error** (403 397 peticiones); el
Circuit Breaker queda `CLOSED` sin ninguna llamada rechazada, sin señal de saturación.

### 3.3 Punto de ruptura (Breakpoint)

`breakpoint.js` sube la tasa de llegada de peticiones sin techo (`ramping-arrival-rate`,
500→10 000 req/s) con `abortOnFail` en los umbrales de error y de `p(95)`, así que el punto
de corte es el breakpoint real medido, no un número elegido a mano. El sistema se degrada
en **latencia** al superar los ~4 500 req/s (p95 pasa de un dígito de milisegundos a
601 ms, p99 = 699 ms), sin arrojar nunca un error HTTP — no hay caída en cascada, solo
degradación progresiva.

### 3.4 Tabla resumen

| Escenario | VUs / patrón | Throughput | Promedio | p90 | p95 | p99 | Error |
|---|---|---:|---:|---:|---:|---:|---:|
| Sostenida | 0→150→0 (12 min) | 639,5 req/s | 2,36 ms | 4,33 ms | 5,32 ms | 7,05 ms | 0,00 % |
| Spike | 0→750→0 (2 min) | 3 075,4 req/s | 2,42 ms | 4,39 ms | 5,54 ms | 12,19 ms | 0,00 % |
| Breakpoint (corte) | hasta 1 311 VUs | 4 548,9 req/s | — | 380,2 ms | 601,4 ms | 699,2 ms | 0,00 % |

**Códigos HTTP de error.** En los tres escenarios locales `http_req_failed` fue 0 %: no hubo
ninguna respuesta 4xx ni 5xx (k6 cuenta como fallida toda respuesta ≥ 400). Cada
iteración verifica además que el estado sea `200` (en el spike se acepta también `503`, que
es la respuesta esperada si el Circuit Breaker se abre, y no se produjo). En las corridas de
producción (§3.5) la tasa de error también fue 0,00 %. Los JSON de k6 no desglosan las
respuestas por código, por lo que no hay tabla por código; con 0 % de fallos, todas las
respuestas fueron 2xx.

**Sobre la rampa del spike.** El enunciado pide subir "de inmediato"; la prueba sube a 750
VUs en 30 s (25 VUs nuevos por segundo), una subida abrupta frente a la rampa de 3 min de
la carga sostenida. No es un salto instantáneo: es una desviación menor que conviene
declarar en la defensa.

### 3.5 Producción (EC2) y comparativa con local

Se repitió la carga sostenida contra la EC2 de producción (directo, sin Cloudflare), con
`load-tests/run.sh` y `LOAD_SCALE` creciente (0,1 / 0,2 / 0,5 del perfil de 150 VUs; el
smoke usa 2 VUs fijos). Resultados en `load-tests/production/`.

| LOAD_SCALE | VUs | Throughput | Mediana | p95 | p99 | Error |
|---|---:|---:|---:|---:|---:|---:|
| 0,1 | 15 | 62,4 req/s | 105,8 ms | 112,0 ms | 122,5 ms | 0,00 % |
| 0,2 | 30 | 125,2 req/s | 98,5 ms | 105,0 ms | 131,5 ms | 0,00 % |
| 0,5 | 75 | 303,0 req/s | 105,6 ms | 209,9 ms | 346,6 ms | 0,00 % |

![Sostenida: local vs producción](../load-tests/comparativa/sustained_local_vs_produccion.png)

- **La latencia base es de red:** el mínimo ronda 86–107 ms (RTT de ~100 ms hasta la EC2),
  frente a 5,3 ms de p95 en local; no son comparables 1 a 1.
- **Con 0,5 aparece la primera degradación:** el throughput sigue casi lineal y la mediana
  no cambia, pero el p95 se duplica (105→210 ms) y el p99 sube 2,6× (131→347 ms). Hay cola
  en el servidor (CPU de la EC2, pool de conexiones o créditos de instancia); falta
  confirmarlo con CloudWatch. Todas las corridas cumplen p95 < 500 ms y error < 1 %.
- **Es un monolito en una sola instancia, la carga no se distribuye.** Todo el tráfico
  entra a un único nodo (un contenedor backend, una JVM, un pool de conexiones y una EC2;
  la BD es RDS, aparte). Por eso estas pruebas miden la capacidad *de una instancia*, y por
  eso, al acercarse al límite, se ve una cola (el p95 y el p99 suben antes que la mediana)
  y no errores. Además los seis endpoints de cada iteración comparten CPU y pool, de modo
  que las consultas pesadas del tablero afectan a las ligeras. La diferencia con local no
  es de arquitectura sino de tamaño de nodo y de red. Escalar horizontalmente es posible
  (la sesión es una cookie JWT sin estado en el servidor), pero la caché Caffeine y el rate
  limiting de bucket4j son locales a cada instancia y habría que revisarlos antes de
  agregar réplicas; mientras tanto, la vía inmediata es vertical (más vCPU/RAM y
  `DB_POOL_MAX_SIZE`). Detalle en `load-tests/README.md`.
- **Brechas frente al enunciado:** en producción se llegó a 75 VUs (se piden 100–200) y no
  se corrieron spike ni breakpoint; esos resultados siguen siendo los de local.

El detalle completo, con las gráficas y los JSON crudos, vive en `load-tests/README.md`.

## 4. DevOps: despliegue en contenedores

- **Contenerización:** `backend/Dockerfile` y `frontend/Dockerfile` multi-stage, backend
  como usuario no root, healthcheck real vía Spring Actuator.
- **Orquestación:** `deploy/docker-compose.yml`, un único compose parametrizado por
  entorno (`--env-file deploy/env/<entorno>.env`) y por *profiles* (`db`, `frontend`,
  `seed`), usado tanto en local como en staging/producción.
- **CI/CD real en GitHub Actions** (no solo validado con `actionlint`): `ci.yml` corre
  build + tests en cada push/PR; `cd.yml` construye y publica imágenes versionadas en
  GitHub Container Registry, y `semantic-release` generó tags reales (`v1.0.0`–`v1.0.2`)
  a partir de Conventional Commits.
- **Frontend en producción real:** Cloudflare Pages sirve la PWA desde su integración
  nativa de Git (build y despliegue por rama, *preview* automático por PR), verificado con
  `curl -I` contra el dominio real (200, con la CSP correcta en la respuesta).
- **Pendiente real, no de alcance:** el job `deploy-backend` de `cd.yml` corre en verde
  pero es un *no-op*: faltan las variables del Environment de GitHub
  (`AWS_REGION`/`AWS_DEPLOY_ROLE_ARN`/`EC2_INSTANCE_ID`) para que
  `deploy/scripts/setup-aws-oidc.sh` y `deploy/scripts/deploy.sh` se ejecuten contra una
  instancia EC2 real. El dominio de la API en producción no resuelve por DNS todavía. Es
  un trabajo de infraestructura concreto y acotado, no una carencia de diseño.

## 5. Conclusión

Los cuatro entregables técnicos de la Fase 4 están cubiertos con evidencia verificable y
ejecutada, no solo declarada: autenticación JWT con cookie `HttpOnly` y autorización por
rol en el backend; una suite de pruebas real y con cobertura medida; dos escenarios de
carga que cumplen los parámetros mínimos del enunciado más un tercero que identifica el
punto de ruptura exacto; y un pipeline de CI/CD que efectivamente construye, prueba y
publica versiones reales. El único punto abierto — el despliegue del backend en AWS — es
un trabajo de infraestructura pendiente y ya documentado, no una omisión técnica.
