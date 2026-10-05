# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) and other coding agents when working with code in this repository.

## Reglas de git para agentes (sin excepcion)

- **Nunca hacer `git push` directo a `develop` ni a `main`.** Todo cambio, sin importar
  quien lo haga (humano o agente) o cuan chico sea, se sube por una rama propia y se
  integra via Pull Request. Esto aplica igual a ambas ramas -- no solo a `main`.
- El bypass de admin que existe en los rulesets de proteccion (`RepositoryRole=admin`)
  esta reservado **exclusivamente** para los pushes automaticos del propio pipeline
  (`RELEASE_TOKEN` en `release`/`back-merge` de `cd.yml`). Un agente no debe usar ese
  bypass, ni un token con permisos equivalentes, para saltarse el flujo de PR.
- Flujo correcto: crear rama (`tipo/descripcion-corta`, ver convencion de commits abajo)
  -> push de esa rama -> `gh pr create` contra `develop` (o contra `main` si es el PR de
  liberacion) -> esperar a que el humano la revise/mergee, o mergearla solo si el humano
  lo pidio explicitamente para ese PR puntual.
- Ver `CONTRIBUTING.md` para el detalle completo del modelo de ramas y las reglas de
  proteccion configuradas en GitHub.

## Que es esto

Ruta · Gestion de entregas: app independiente de verificacion de entregas con PIN, foto
y GPS. Frontend React/TypeScript + backend Java 17/Spring Boot (paquete
`com.ruta.deliverypin`) + PostgreSQL. Ver `README.md` para el modelo de negocio y el uso
de la app, y `CONTRIBUTING.md` para el modelo de ramas y convencion de commits
(Conventional Commits, con efecto real en `semantic-release` — el prefijo importa).

## Comandos

### Backend (Java 17 / Maven / Spring Boot)

Sin Maven instalado localmente, usar el contenedor oficial (asi corre CI):

```bash
# Suite completa, incluye Testcontainers (requiere Docker; monta el socket)
docker run --rm -v "$PWD":/repo -v maven-repo-cache:/root/.m2 \
  -v /var/run/docker.sock:/var/run/docker.sock -w /repo/backend \
  maven:3.9-eclipse-temurin-17 mvn test

# Sin Docker disponible para Testcontainers: excluye solo las *IntegrationTest
mvn test -Dtest='!*IntegrationTest'

# Una sola clase de test
mvn test -Dtest=AuthControllerTest

# Compilar sin tests
mvn -DskipTests compile
```

Cobertura JaCoCo: `backend/target/site/jacoco/index.html`. Testcontainers cubre
`LocalInvoiceAdapterIntegrationTest`, `OperationalCostInputAdapterIntegrationTest`,
`InvoiceFixtureLoaderIntegrationTest`, `OpenApiContractIntegrationTest` y `CsrfCookieSurvivesAcrossRequestsIntegrationTest`
(esta ultima necesita Tomcat real con `@SpringBootTest(webEnvironment = RANDOM_PORT)`,
no `MockHttpServletRequest`, para reproducir bugs de cookies/CSRF).

### Frontend (TypeScript / Vite / pnpm)

Requiere Node 24 (Node 20 falla en `vitest` con `jsdom`/`undici`: `webidl.util.
markAsUncloneable is not a function`). Corepack fija la version de pnpm sola desde
`frontend/package.json` -> `packageManager`.

```bash
cd frontend
corepack enable && pnpm install --frozen-lockfile

pnpm test                    # vitest run
pnpm run test:coverage       # vitest run --coverage (el CI exige >= 90 %)
pnpm exec vitest run path/to/archivo.test.ts   # un solo archivo
pnpm run typecheck           # tsc -b --noEmit
pnpm run lint                # oxlint src vite.config.ts
pnpm run build               # tsc -b (falla si hay errores de tipos) + vite build
pnpm run dev                  # servidor de desarrollo
```

### Verificacion end-to-end real (no solo unit tests)

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/env/local.env up -d --build --wait
python scripts/verify_delivery.py
```

`verify_delivery.py` crea sus propios pedidos (`VERIFY/...`) contra un stack real: login
por cookie, CSRF, PIN, concurrencia, foto, GPS e incidencias. Varios bugs reales de este
proyecto (auto-invalidacion del token CSRF, esquema de auth roto tras la migracion a
cookie) solo se manifestaron ejecutando esto contra Tomcat real, nunca en tests
unitarios o `MockMvc`.

## Arquitectura

### Backend: hexagonal (ports & adapters)

```
domain/
  model/          Value objects e entidades de dominio puras (Invoice, Driver, DeliveryAttempt...)
  port/in/        Casos de uso (interfaces) -- p. ej. ConfirmDeliveryUseCase, ManageInvoicesUseCase
  port/out/       Puertos de salida (interfaces) -- p. ej. InvoiceAdminPort, DriverRepositoryPort
  exception/      Excepciones de dominio (InvalidPinException, DeliveryAlreadyConfirmedException...)
application/      Implementa los port/in orquestando port/out (*ApplicationService)
infrastructure/
  adapter/in/web/       Controladores REST + DTOs; SecurityConfig, JwtAuthenticationFilter
  adapter/out/          Implementa port/out: JPA (persistence/), el "ERP" simulado
                        (invoice/LocalInvoiceAdapter, con Circuit Breaker+Retry+Cache Aside),
                        seguridad (security/)
  config/               *Properties (@ConfigurationProperties por dominio: Cors, Admin,
                        LoginRateLimit, Seed, Cache, Cost, Resilience, Jwt) + runners de
                        arranque (AdminBootstrapRunner, SecretsGuardRunner)
  seed/                 Carga de datos de muestra (solo primer arranque; ver mas abajo)
```

Los controladores dependen de un puerto de entrada (caso de uso), nunca de un adaptador
de salida directamente — violarlo (p. ej. un controlador llamando a un `*Adapter` en vez
de a un `*UseCase`) es la regresion arquitectonica mas comun a vigilar en revisiones.

Todos los endpoints de negocio estan bajo `/api/v1/{admin,driver,auth}` (versionado
explicito). `GlobalExceptionHandler` unifica toda excepcion de negocio en un
`ErrorResponse` con el codigo HTTP correcto (400/401/403/404/409/422/429/503); nunca
agregar un `@ExceptionHandler` disperso en un controlador.

**Seguridad** (`SecurityConfig`): JWT en cookie `HttpOnly` (no `Authorization` header ni
localStorage) + CSRF con patron doble-cookie (`CookieCsrfTokenRepository.
withHttpOnlyFalse()` + `X-XSRF-TOKEN`). El `sessionAuthenticationStrategy` **debe** fijarse
dentro del builder `.csrf(...)`, no en `.sessionManagement(...)` — `CsrfConfigurer` crea su
propia estrategia por defecto si no se le pasa ahi, y la AGREGA (no reemplaza) a la de
`SessionManagementConfigurer`, causando que el token CSRF se auto-invalide en cada
peticion autenticada, no solo en el login. Bug real, encontrado con logging DEBUG contra
Tomcat real y confirmado leyendo el bytecode de Spring Security — no es un detalle menor
si se toca este archivo.

**Contrato**: `docs/openapi.json` es la fuente de verdad (contract-first); un cambio de API
empieza editandolo, y `OpenApiContractIntegrationTest` falla si `/v3/api-docs` difiere. El
montaje del repo completo en el comando de tests es necesario porque el test lee `../docs`.

**Migraciones**: Flyway (`backend/src/main/resources/db/migration/V*.sql`) es la unica
fuente de verdad del esquema — nunca `ddl-auto=update`. Forward-only: un rollback de
version despliega la imagen anterior pero no revierte el esquema (ver "Robustez" en
README), asi que las migraciones deben seguir el patron expand/contract.

**Resiliencia**: Resilience4j Circuit Breaker + Retry alrededor de `LocalInvoiceAdapter`
(simula el ERP externo), Caffeine para Cache Aside sobre lecturas inmutables de
facturas, bucket4j para rate limiting de login y de `/confirm` por conductor.

**Seed de datos** (`infrastructure/seed/`): `APP_SEED_ENABLED` es `false` por defecto y en
el backend real siempre (incluso en el stack de muestra local) — solo un job `seed`
efimero de Compose lo activa momentaneamente para cargar `demo/invoices.json`.
`SecretsGuardRunner` bloquea secretos/contrasenas de ejemplo fuera de ese modo.

### Frontend: React + TypeScript estricto

```
src/api/client.ts       axios con withCredentials + withXSRFToken (cookie CSRF automatica)
src/context/            AuthContext (objeto y hook separados para no romper Fast Refresh)
src/hooks/useAsyncData.ts   patron loading/error/data centralizado (reemplaza 7 efectos repetidos)
src/pages/admin/         paneles de administrador (dashboard/ dividido en 3 subcomponentes)
src/pages/driver/        pantalla del conductor; driverHome/ tiene OCR, GPS y compresion
                        de imagen extraidos a utilidades propias (imageUtils.ts) para
                        poder testearlas sin montar el componente completo
```

Todas las rutas usan `React.lazy` + code-splitting por ruta (`vite.config.ts` separa
`vendor-react`/`vendor-leaflet`). Manejo de errores: `catch(err: unknown)` +
`getErrorMessage` (nunca `catch(err: any)`), consistente en toda la app.

## CI/CD (`.github/workflows/`)

`ci.yml` prueba backend+frontend y valida que el Dockerfile construya, en cada push a
`develop`/`main` y en cada PR. `cd.yml` se dispara con `workflow_run` tras `CI` y sigue el
orden **build-images -> release -> retag-release** (deliberado: nunca crear un
tag/GitHub-Release sin que la imagen que lo respalda ya se haya construido y publicado —
ver comentarios en `cd.yml` y `CONTRIBUTING.md` para el detalle completo, incluido por
que `GITHUB_TOKEN` no puede pushear a `main`/`develop` protegidos y se usa un
`RELEASE_TOKEN` (PAT de admin) en su lugar).
