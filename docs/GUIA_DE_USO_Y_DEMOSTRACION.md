# Guía de uso y demostración de Ruta · Gestión de entregas

Esta guía explica cómo poner en marcha la aplicación, cómo se usa cada pantalla y cómo demostrar, paso a paso,
que cada mecanismo funciona: el PIN de un solo uso, la evidencia con foto y GPS, la seguridad, el rate limiting, la
caché y el Circuit Breaker. Todos los comandos de la sección de API se ejecutaron contra el stack local antes de
escribirla.

## Contenido

1. [Qué es la aplicación](#1-qué-es-la-aplicación)
2. [Puesta en marcha](#2-puesta-en-marcha)
3. [Recorrido por la interfaz](#3-recorrido-por-la-interfaz)
4. [Guion de demostración (15 minutos)](#4-guion-de-demostración-15-minutos)
5. [Demostración por API con `curl`](#5-demostración-por-api-con-curl)
6. [Seguridad y reglas de negocio](#6-seguridad-y-reglas-de-negocio)
7. [Resiliencia: Circuit Breaker, Retry, caché y límites](#7-resiliencia-circuit-breaker-retry-caché-y-límites)
8. [Pruebas, cobertura y carga](#8-pruebas-cobertura-y-carga)
9. [Producción y despliegue](#9-producción-y-despliegue)
10. [Mapa de la documentación](#10-mapa-de-la-documentación)
11. [Problemas frecuentes](#11-problemas-frecuentes)

## 1. Qué es la aplicación

Ruta verifica que una entrega se hizo de verdad. Cada entrega queda respaldada por tres pruebas: un **PIN de seis
dígitos** que solo conoce el cliente, una **foto de evidencia** y la **ubicación GPS** del conductor, que se compara
con la dirección de la factura. La aplicación son tres piezas:

| Pieza | Para quién | Qué hace |
|---|---|---|
| **API REST** (Java 17, Spring Boot, PostgreSQL) | Las otras dos piezas | Genera y valida el PIN, guarda la evidencia, calcula métricas y costos |
| **PWA del conductor** (React) | Conductores en campo | Buscar la factura, verificar productos, tomar la foto y confirmar con PIN y GPS; reportar incidencias |
| **Panel de administración** (React) | Administradores | Crear y publicar facturas, ver los PIN, gestionar el equipo, revisar entregas, mapa, métricas y costos |

Hay dos roles, y la API los aplica por separado del frontend:

- **ADMIN:** todo el panel. Es el único que puede ver el PIN.
- **CONDUCTOR:** solo sus pantallas y su propio historial. Nunca recibe el PIN: lo debe pedir al cliente.

### El ciclo de una entrega

```
Administrador            Cliente                 Conductor                 Sistema
     |                      |                        |                        |
     | 1. crea factura (borrador)                    |                        |
     | 2. publica -> se genera el PIN ---------------------------------------->|
     | 3. comunica el PIN al cliente ->|              |                        |
     |                      |  4. el conductor llega  |                        |
     |                      |<-- le pide el PIN ------|                        |
     |                      |------ 6 dígitos ------->| 5. busca la factura,   |
     |                      |                        |    verifica productos, |
     |                      |                        |    toma foto, captura GPS
     |                      |                        |---- confirma --------->|
     |                      |                        |   6. valida PIN, guarda foto, ubicación y distancia
     | 7. ve la entrega en Entregas, en el mapa y en las métricas              |
```

Si la entrega no se puede completar, el conductor reporta una **incidencia** (motivo y ubicación) sin cancelar la
factura.

## 2. Puesta en marcha

### Requisitos

- Docker (Docker Desktop abierto en Windows/macOS).
- Opcional: Python 3 (solo para `scripts/verify_delivery.py`) y Node 24 con `pnpm` (solo para ejecutar las pruebas
  del frontend).

### Pasos

Desde la raíz del repositorio:

```bash
# 1. Configurar secretos (el archivo no se sube a git)
cp deploy/env/local.env.example deploy/env/local.env
# edita deploy/env/local.env: define ADMIN_PASSWORD, DB_PASSWORD y JWT_SECRET (mínimo 32 caracteres)

# 2. Levantar PostgreSQL, el backend, el frontend y el nginx (la primera vez tarda varios minutos: compila)
docker compose -f deploy/docker-compose.yml --env-file deploy/env/local.env up -d --build --wait

# 3. Comprobar que todo está sano
docker compose -f deploy/docker-compose.yml --env-file deploy/env/local.env ps
```

Un job efímero `seed` carga `demo/invoices.json`: **59 facturas**, 314 productos y un conductor de muestra. Solo
carga datos si no hay facturas en la base, así que reiniciar no duplica nada.

### Accesos

| Qué | Dirección | Credenciales |
|---|---|---|
| Aplicación (login) | http://localhost:8080 | — |
| Administrador | http://localhost:8080 | `admin` / el valor de `ADMIN_PASSWORD` de tu `local.env` |
| Conductor de muestra | http://localhost:8080 | `conductor` / `conductor123` |
| API | http://localhost:8080/api/v1/... | cookie de sesión (ver §5) |
| Swagger UI | http://localhost:8080/swagger-ui/index.html | Basic Auth de nginx (ver `README.md`, "Swagger UI") |
| Contrato OpenAPI | http://localhost:8080/v3/api-docs | — |

Los números de factura y los PIN de las 59 facturas de muestra están en `demo/facturas_y_pines.csv`.

### Apagar

```bash
# conserva los datos (volumen de PostgreSQL)
docker compose -f deploy/docker-compose.yml --env-file deploy/env/local.env down
# borra también los datos
docker compose -f deploy/docker-compose.yml --env-file deploy/env/local.env down -v
```

## 3. Recorrido por la interfaz

### Administrador (`/admin`)

El menú lateral tiene cuatro secciones.

**Panorama.** El centro de operaciones: un mapa con las entregas e incidencias (la ubicación registrada de cada
una), las métricas por conductor (confirmadas, rechazadas, incidencias y total) en un rango de fechas de hasta 93
días, el **costo por entrega verificada** del mes (entregas confirmadas, almacenamiento de evidencia,
infraestructura y soporte; es un reporte informativo que no genera cargos), con un selector de mes y el campo
**Horas de soporte** del mes (botón *Guardar horas*, que usa `PUT /api/v1/admin/cost/support-hours`), y el panel de
**Resiliencia (Circuit Breaker + Retry)**, donde se consulta el estado y se pueden simular fallas.

**Facturas.** Para crear y publicar pedidos:
- *Nueva factura* abre el formulario: número, cliente, dirección, coordenadas esperadas, si requiere PIN y los
  productos. Se guarda como **borrador**.
- *Publicar* cambia el estado a `posted` y **genera el PIN de seis dígitos**. Solo aquí aparece el PIN.
- El buscador filtra por número o cliente (con paginación de 20 por página).
- *Exportar facturas y PIN* descarga un CSV, útil para comunicar los PIN a los clientes.

**Equipo.** Crear cuentas con rol (`ADMIN` o `CONDUCTOR`), activar o desactivar usuarios y eliminarlos. Un usuario
desactivado deja de poder entrar de inmediato; no se puede eliminar a quien ya tiene historial de entregas.

**Entregas.** El registro de actividad completo y paginado: cada confirmación, rechazo e incidencia, con el
conductor, la ubicación, la **distancia a la dirección esperada** y la **foto de evidencia**.

### Conductor (`/driver`)

La pantalla principal guía "una entrega en tres pasos":

1. **Revisa el pedido.** Busca por número de factura o nombre del cliente (hasta 20 resultados; con el número
   completo se encuentra directo). El botón *Escanear factura con la cámara* lee el número de la foto de la
   factura con reconocimiento de texto (OCR) en el propio dispositivo. Al abrir la factura aparece la lista de
   productos y el conductor debe **marcar todos** antes de continuar.
2. **Guarda la evidencia.** Toma la foto de la entrega. Se comprime en el dispositivo (máximo 1280 px, calidad
   0,7) antes de enviarse.
3. **Confirma con PIN.** Introduce los seis dígitos que le dice el cliente. La app captura el GPS; si la ubicación
   está a **más de 2 km** de la dirección registrada, pide confirmación antes de seguir. Hay un campo de
   observaciones opcional.

El botón de confirmar solo se habilita con el PIN completo, todos los productos marcados y la foto tomada.

Además: **Reportar incidencia** (motivos predefinidos: *Cliente ausente*, *Dirección incorrecta*, *Producto
dañado*, *Cliente rechazó la entrega*, *Otro*, con notas) y **Historial**, con las entregas propias del conductor y
sus fotos. En el navegador hay que permitir el acceso a la **ubicación** y a la **cámara** desde `localhost`.

## 4. Guion de demostración (15 minutos)

Un recorrido con la interfaz que muestra todo el ciclo y los controles de seguridad. Usa dos ventanas (o una
ventana normal y otra de incógnito): una para el administrador y otra para el conductor.

| # | Quién | Acción | Qué se demuestra |
|---|---|---|---|
| 1 | Admin | Iniciar sesión → **Facturas** → *Nueva factura* con un número nuevo, un cliente y un producto → guardar | La factura nace como **borrador** y no tiene PIN |
| 2 | Admin | *Publicar* la factura | El estado pasa a publicada y **aparece el PIN**; el admin es el único que lo ve |
| 3 | Conductor | Iniciar sesión → buscar el número de la factura | Encuentra la factura y **no se muestra el PIN** en ninguna parte |
| 4 | Conductor | Abrir la factura, marcar los productos, tomar la foto | El botón de confirmar sigue deshabilitado hasta tener PIN completo, productos y foto |
| 5 | Conductor | Escribir un PIN **incorrecto** y confirmar | Error "El PIN ingresado no es correcto." (422); la entrega queda registrada como **rechazada** |
| 6 | Conductor | Repetir el PIN incorrecto hasta 5 veces seguidas | Al 5.º fallo la **factura se bloquea 5 minutos**: ni el PIN correcto la desbloquea |
| 7 | Admin | Publicar otra factura y usar su PIN en el conductor | Con el PIN correcto: **entrega confirmada** y evidencia guardada |
| 8 | Conductor | Intentar confirmar esa misma factura de nuevo | Rechazo: "La entrega de esta factura ya fue confirmada." (409): no se puede entregar dos veces |
| 9 | Conductor | En otra factura, *Reportar incidencia* con el motivo "Cliente ausente" | La incidencia se registra sin cancelar la factura |
| 10 | Admin | **Entregas** | Aparecen la confirmación, el rechazo y la incidencia, con foto, ubicación y distancia |
| 11 | Admin | **Panorama** | El mapa muestra los puntos; las métricas por conductor cuentan confirmadas, rechazadas e incidencias |
| 12 | Admin | **Panorama** → costo del mes | Entregas confirmadas, GB de evidencia y costo por entrega (informativo, no genera cargos); con las tarifas en 0 el costo es 0 y los datos reales son las entregas y los GB; las horas de soporte se pueden editar y guardar ahí mismo |
| 13 | Admin | **Panorama** → Resiliencia → simular fallas, y luego buscar una factura como conductor varias veces | El breaker se **abre** y la búsqueda responde 503 sin tocar la base; tras unos segundos pasa a `HALF_OPEN` y se recupera solo |
| 14 | — | Iniciar sesión 6 veces con una contraseña incorrecta | A partir del 6.º intento, **429**: el login se limita por IP y usuario |
| 15 | Admin | Abrir **Swagger UI** | El contrato completo y navegable de la API |

## 5. Demostración por API con `curl`

La API autentica con una **cookie `HttpOnly`** (el token no es accesible desde JavaScript) y protege las
escrituras con **CSRF de doble cookie**: cada `POST`/`PUT`/`DELETE` debe llevar el header `X-XSRF-TOKEN` con el valor
de la cookie `XSRF-TOKEN`. Los comandos usan un archivo de cookies de `curl` para guardar y reenviar ambas.

### 5.1 Preparar variables

```bash
cd <raíz del repositorio>
BASE=http://localhost:8080
ADMIN_PW=$(grep '^ADMIN_PASSWORD=' deploy/env/local.env | cut -d= -f2-)
cd "$(mktemp -d)"        # carpeta temporal para los archivos de cookies
```

### 5.2 Administrador: iniciar sesión, crear y publicar una factura

```bash
# Login: la respuesta trae usuario y rol; la cookie de sesión y el token CSRF quedan en admin.jar
curl -s -c admin.jar -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PW\"}" $BASE/api/v1/auth/login
XSRF=$(awk '$6=="XSRF-TOKEN"{print $7}' admin.jar)

# Crear la factura (queda en borrador, pin: null)
NUM="DEMO-$(date +%s)"
curl -s -b admin.jar -H "X-XSRF-TOKEN: $XSRF" -H 'Content-Type: application/json' -d "{
  \"number\":\"$NUM\",\"partnerName\":\"Cliente de demostracion\",
  \"deliveryAddress\":\"Calle de prueba, Guayaquil\",\"latitude\":-2.170998,\"longitude\":-79.922359,
  \"requiresPin\":true,\"products\":[{\"description\":\"Arroz blanco - funda 1 kg\",\"quantity\":2}]}" \
  $BASE/api/v1/admin/invoices

# Obtener su id y publicarla (genera el PIN)
ID=$(curl -s -b admin.jar "$BASE/api/v1/admin/invoices?q=$NUM" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
curl -s -b admin.jar -H "X-XSRF-TOKEN: $XSRF" -X POST $BASE/api/v1/admin/invoices/$ID/publish
PIN=$(curl -s -b admin.jar "$BASE/api/v1/admin/invoices?q=$NUM" | grep -o '"pin":"[0-9]*"' | head -1 | grep -o '[0-9]*')
echo "id=$ID  PIN=$PIN"
```
Resultado esperado: la factura se crea con `"state":"draft"` y `"pin":null`; tras publicarla pasa a `"state":"posted"`
con un PIN de seis dígitos.

### 5.3 Conductor: buscar la factura (sin PIN) y ver sus productos

```bash
curl -s -c drv.jar -H 'Content-Type: application/json' \
  -d '{"username":"conductor","password":"conductor123"}' $BASE/api/v1/auth/login
DX=$(awk '$6=="XSRF-TOKEN"{print $7}' drv.jar)

curl -s -b drv.jar "$BASE/api/v1/driver/invoices?q=$NUM"        # NO incluye el campo pin
curl -s -b drv.jar $BASE/api/v1/driver/invoices/$ID/lines        # productos a verificar
```

### 5.4 Conductor: confirmar la entrega (PIN incorrecto, correcto, repetida e idempotente)

```bash
# Foto de ejemplo: un PNG de 1x1 píxel en base64 (la API exige un JPEG o PNG real, hasta 5 MB)
PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
conf() { curl -s -w '\nHTTP %{http_code}\n' -b drv.jar -H "X-XSRF-TOKEN: $DX" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $2" -d "{\"invoiceId\":$ID,\"pin\":\"$1\",\"latitude\":-2.1710,\"longitude\":-79.9224,
  \"photoBase64\":\"data:image/png;base64,$PNG\",\"photoFilename\":\"evidencia.png\",\"photoContentType\":\"image/png\"}" \
  $BASE/api/v1/driver/deliveries/confirm; }

conf 000000 k1      # PIN incorrecto
conf "$PIN" k2      # PIN correcto
conf "$PIN" k3      # la misma factura otra vez, con otra clave
conf "$PIN" k2      # reintento con la MISMA clave que la confirmación correcta
```

| Llamada | Respuesta esperada | Qué demuestra |
|---|---|---|
| `conf 000000 k1` | **422** "El PIN ingresado no es correcto." | El PIN se valida en el servidor; el intento queda como rechazado |
| `conf "$PIN" k2` | **200** `success: true, photoUploaded: true` | Confirmación y evidencia guardadas en una sola transacción |
| `conf "$PIN" k3` | **409** "La entrega de esta factura ya fue confirmada." | No se puede entregar dos veces |
| `conf "$PIN" k2` | **200** con la respuesta anterior | **Idempotencia**: un reintento con la misma `Idempotency-Key` devuelve la respuesta ya dada sin repetir la operación (útil con mala conectividad) |

### 5.5 Bloqueo del PIN tras 5 fallos

Con una factura nueva (repite 5.2 con otro número): cinco confirmaciones con PIN incorrecto dan **422**; a partir
de la sexta, **incluso con el PIN correcto**, la respuesta es **400** "Factura bloqueada temporalmente por intentos
de PIN fallidos" durante 5 minutos. Además, `/confirm` está limitado por conductor para frenar el intento de adivinar
el PIN probando muchas facturas seguidas.

### 5.6 Incidencia, historial y panel

```bash
# Reportar una incidencia (no cancela la factura)
curl -s -b drv.jar -H "X-XSRF-TOKEN: $DX" -H 'Content-Type: application/json' -d "{
  \"invoiceId\":$ID,\"invoiceNumber\":\"$NUM\",\"partnerName\":\"Cliente de demostracion\",
  \"deliveryAddress\":\"Calle de prueba, Guayaquil\",\"reason\":\"Cliente ausente\",
  \"notes\":\"Nadie respondio\",\"latitude\":-2.1710,\"longitude\":-79.9224}" $BASE/api/v1/driver/deliveries/incident

# El conductor ve solo su historial; el administrador ve todo
curl -s -b drv.jar "$BASE/api/v1/driver/deliveries/history?page=0&size=5"
curl -s -b admin.jar "$BASE/api/v1/admin/deliveries?page=0&size=5"

# Métricas por conductor (rango de hasta 93 días) y costo por entrega del mes
F=$(date -u -d '30 days ago' +%FT%TZ); T=$(date -u +%FT%TZ); M=$(date -u +%Y-%m)
curl -s -b admin.jar "$BASE/api/v1/admin/dashboard/metrics?from=$F&to=$T"
curl -s -b admin.jar "$BASE/api/v1/admin/cost?month=$M"
```
En el historial, cada intento trae `outcome` (`CONFIRMED`, `REJECTED` o `INCIDENT`), la ubicación, la distancia a la
dirección esperada y `hasPhoto`.

### 5.7 Controles de acceso

```bash
curl -s -o /dev/null -w 'conductor en el panel: HTTP %{http_code}\n' -b drv.jar $BASE/api/v1/admin/users      # 403
curl -s -o /dev/null -w 'sin sesion:            HTTP %{http_code}\n' "$BASE/api/v1/driver/invoices?q=1"      # 401
curl -s -o /dev/null -w 'escritura sin CSRF:    HTTP %{http_code}\n' -b admin.jar -H 'Content-Type: application/json' \
  -d '{"count":1}' $BASE/api/v1/admin/resilience/simulate-failures                                           # 403
```

## 6. Seguridad y reglas de negocio

| Mecanismo | Cómo funciona | Cómo se ve |
|---|---|---|
| **Autenticación JWT en cookie `HttpOnly`** | El login fija una cookie con el JWT; ningún script del navegador puede leerla | El cuerpo del login no trae token |
| **CSRF de doble cookie** | Las escrituras exigen `X-XSRF-TOKEN` igual a la cookie `XSRF-TOKEN` | Una escritura sin el header da 403 |
| **Autorización por rol** | `/api/v1/admin/**` solo `ADMIN`; `/api/v1/driver/**` admite `ADMIN` y `CONDUCTOR`; el conductor ve solo lo suyo | Conductor en el panel: 403; sin sesión: 401 |
| **Contraseñas** | BCrypt; el arranque falla si `JWT_SECRET` o `ADMIN_PASSWORD` conservan el valor de ejemplo | — |
| **Rate limiting del login** | 5 intentos fallidos por minuto por IP y usuario (bucket4j) | 429 desde el 6.º intento |
| **Bloqueo del PIN** | 5 fallos seguidos bloquean la factura 5 minutos | 400 incluso con el PIN correcto |
| **Límite de confirmaciones** | Por conductor, contra la adivinación del PIN en muchas facturas | 429 |
| **PIN solo para el admin** | Los DTO del conductor no incluyen el PIN | El campo `pin` no existe en sus respuestas |
| **Validación de la evidencia** | La foto debe ser un JPEG o PNG real (por sus primeros bytes) de hasta 5 MB; las coordenadas, dentro de rango | 400 si no cumple |
| **Integridad** | La confirmación y la evidencia van en una transacción; las confirmaciones simultáneas se serializan con bloqueo de fila | Dos conductores no pueden confirmar la misma factura |
| **Error único** | Toda respuesta 4xx/5xx tiene la forma `{message, errors, path, timestamp}` | Igual en todos los endpoints |

Códigos de respuesta: 400 validación o factura bloqueada · 401 sin sesión o credenciales inválidas · 403 rol o CSRF ·
404 no existe · 409 ya confirmada o duplicado · 422 PIN incorrecto · 429 demasiados intentos · 503 ERP simulado
caído (circuito abierto).

## 7. Resiliencia: Circuit Breaker, Retry, caché y límites

El ERP del cliente está **simulado** por una capa local de facturas, protegida con patrones de resiliencia.

### Circuit Breaker (con comandos probados)

```bash
curl -s -b admin.jar $BASE/api/v1/admin/resilience/status                      # estado: CLOSED
curl -s -b admin.jar -H "X-XSRF-TOKEN: $XSRF" -H 'Content-Type: application/json' \
  -d '{"count":6}' $BASE/api/v1/admin/resilience/simulate-failures             # programa 6 fallas simuladas
for i in 1 2 3 4 5 6 7 8; do                                                   # buscar facturas varias veces
  curl -s -o /dev/null -w "busqueda $i: %{http_code}\n" -b drv.jar "$BASE/api/v1/driver/invoices?q=$i$i"
done
curl -s -b admin.jar $BASE/api/v1/admin/resilience/status                      # estado: OPEN
sleep 16                                                                       # espera de 15 s por defecto
curl -s -o /dev/null -w 'tras la espera: %{http_code}\n' -b drv.jar "$BASE/api/v1/driver/invoices?q=00"   # 200
curl -s -b admin.jar $BASE/api/v1/admin/resilience/status                      # HALF_OPEN y luego CLOSED
```
Resultado observado: las 8 búsquedas responden **503** (primero por las fallas simuladas y luego porque el circuito
está abierto, sin tocar la base de datos); el estado pasa a `OPEN` con una tasa de fallo del 50 %; tras la espera la
siguiente búsqueda responde **200**, el estado pasa a `HALF_OPEN` y se cierra solo con las siguientes llamadas
correctas. La recuperación es automática.

### Retry, caché y rate limiting

| Patrón | Qué hace | Cómo comprobarlo |
|---|---|---|
| **Retry** | Reintenta las lecturas fallidas del ERP simulado antes de abrir el circuito | El estado del breaker muestra `retrySuccessfulCallsWithoutRetry` y `retryFailedCallsWithRetry` |
| **Cache Aside** (Caffeine, TTL 300 s) | Las líneas de factura y la ubicación esperada no cambian tras crear la factura, así que se cachean | Con la caché caliente, leer las líneas repetidas veces **no genera consultas** a la tabla; las lecturas frías, una por factura |
| **Rate limiting del login** | 5 intentos fallidos/minuto por IP + usuario | 6.º intento: 429 |
| **Idempotencia** | `Idempotency-Key` en confirmar e incidencia | Ver §5.4 |

Para comprobar caché y rate limiting con un script: `load-tests/verificar_cache_ratelimit.sh` (ver
`load-tests/README.md`).

## 8. Pruebas, cobertura y carga

```bash
# Backend: 139 pruebas, incluidas las de integración con PostgreSQL real (Testcontainers; requiere Docker)
docker run --rm -v "$PWD":/repo -v maven-repo-cache:/root/.m2 -v /var/run/docker.sock:/var/run/docker.sock \
  -w /repo/backend maven:3.9-eclipse-temurin-17 mvn test
# Cobertura JaCoCo (81 % de instrucciones): backend/target/site/jacoco/index.html

# Frontend (Node 24): 215 pruebas con cobertura (97,5 % de instrucciones; el CI exige al menos 90 %)
cd frontend && corepack enable && pnpm install --frozen-lockfile && pnpm run test:coverage && pnpm run typecheck && pnpm run lint

# Verificación de punta a punta contra el stack real levantado (login, CSRF, PIN, concurrencia, foto, GPS, incidencias)
RUTA_API=http://localhost:8080 RUTA_PASSWORD=$ADMIN_PW python scripts/verify_delivery.py
```

La prueba `OpenApiContractIntegrationTest` compara lo que publica la API con `docs/openapi.json` y falla si
difieren: el contrato es la fuente de verdad.

**Pruebas de carga (k6).** Resultados completos, escenarios y gráficas en `load-tests/README.md` y en la Fase 4:

| Escenario | Local | Producción (EC2) |
|---|---|---|
| Sostenida, 150 VUs durante 7 min | 654 req/s, p95 7,0 ms, 0 % de error | 590 req/s, p95 122 ms, 0 % de error |
| Spike, hasta 750 VUs | p95 9,5 ms, 0 % de error; recuperación sin errores | 0,7–0,8 % de error en el pico; recuperación con p95 de ~104 ms y 0 % de error |
| Punto de ruptura | ~4 500 req/s | ~970 req/s efectivos (entre 900 y 1 500 req/s de tasa objetivo) |

## 9. Producción y despliegue

- **Backend:** una instancia EC2 con Docker Compose (nginx de borde y el contenedor de la API), con la base de datos en
  Amazon RDS for PostgreSQL. El nginx termina TLS, protege Swagger con Basic Auth, aplica una política CSP por ruta y
  expone `/healthz`.
- **Frontend:** Cloudflare Pages, con despliegue por rama y *preview* automático por pull request.
- **Despliegue y rollback:** `deploy/scripts/deploy.sh <entorno> [tag]` descarga la imagen versionada, hace un respaldo,
  espera los *healthchecks*, verifica por el nginx y vuelve solo a la última imagen buena si algo falla. El rollback es de
  imagen, no de esquema (Flyway solo avanza, por eso las migraciones siguen el patrón *expand/contract*).
- **CI/CD:** GitHub Actions. `ci.yml` prueba backend y frontend en cada PR; `cd.yml` construye y publica imágenes
  versionadas en GHCR, y `semantic-release` calcula la versión a partir de Conventional Commits.
- **Ramas:** todo cambio entra por pull request a `develop`, y de `develop` a `main` en la liberación (ver
  `CONTRIBUTING.md`).

## 10. Mapa de la documentación

| Documento | Contenido |
|---|---|
| `README.md` | Puesta en marcha, API, costo, Circuit Breaker, despliegue y CI/CD |
| `docs/Fase1_Vision_Producto_Modelo_Negocio_API_Final.md` | Justificación de negocio, cadena de valor y monetización (showback) |
| `docs/Fase2_Arquitectura_Patrones_API.md` | Estilo REST, modelo C4 y patrones (hexagonal, Circuit Breaker, Retry, Cache Aside, rate limiting) |
| `docs/Fase3_Modelo_Datos_Especificacion_API.md` | Recursos de la API y contrato OpenAPI contract-first |
| `docs/openapi.json` | El contrato OpenAPI (fuente de verdad) |
| `docs/Fase4_Desarrollo_Seguridad_Despliegue.md` | Seguridad, calidad, pruebas de carga y despliegue, con el cumplimiento del enunciado |
| `load-tests/README.md` | Escenarios k6, resultados, medición de recursos y procedimiento de corridas |
| `docs/EVALUACION_TECNICA.md` | Evaluación técnica del repositorio y su historial |
| `CONTRIBUTING.md` | Modelo de ramas, Conventional Commits y reglas de protección |

## 11. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| El navegador no deja usar cámara o GPS | Permite la ubicación y la cámara para `localhost`; en producción la página debe servirse por HTTPS |
| Login correcto pero las acciones posteriores dan 403 | Falta el token CSRF. En curl, reenvía `X-XSRF-TOKEN`; en el navegador con la API y el frontend en dominios distintos, `COOKIE_DOMAIN` debe ser el dominio compartido (ver `README.md`) |
| `429` al iniciar sesión | Hay 5 intentos fallidos recientes de esa IP y usuario; espera 60 s |
| La factura responde "bloqueada temporalmente" | Hubo 5 PIN incorrectos seguidos; espera 5 minutos |
| Las búsquedas del conductor dan 503 | El Circuit Breaker está abierto (fallas simuladas o reales); en 15 s pasa a `HALF_OPEN` y se recupera solo |
| `docker compose up` falla con "define SERVER_NAME" o con un secreto de ejemplo | Revisa `deploy/env/local.env`: `JWT_SECRET` (mínimo 32 caracteres) y `ADMIN_PASSWORD` no pueden conservar el valor de ejemplo |
| Swagger responde 401 | Falta el usuario de documentación del nginx (`deploy/secrets/docs.htpasswd`, ver `README.md`) |
| Las pruebas de integración del backend fallan sin Docker | Excluye las de Testcontainers con `mvn test -Dtest='!*IntegrationTest'` |
