# DOCUMENTO DE ARQUITECTURA DE SOFTWARE Y JUSTIFICACIÓN DE PATRONES DE LA API

**Plataforma interna de verificación de entregas para la empresa de retail analizada**

## Fase 2 - Arquitectura y Patrones (RA2)

| Campo | Información |
|---|---|
| **Autores** | Aliatis Enzo<br>Cadme Mauro<br>Murillo Jordan<br>Suárez Galo |
| **Asignatura** | Patrones de Diseño de APIs |
| **Docente** | Patsy Malena Prieto Vélez |
| **Versión** | 1.1 |
| **Fecha** | 26 de septiembre de 2026 |
| **Estado** | Para revisión |

> **Nota de trabajo.** Versión editable del Word de la Fase 2, alineada con `sistema-pruebas-entrega-1.5.dsl` y con la evaluación técnica vigente (`docs/EVALUACION_TECNICA.md`). El **Anexo A** registra las verificaciones hechas contra el código y su resultado. Las figuras se generan desde el DSL y ya existen en la carpeta `figuras/` (ver Anexo A).

---

## 1. Introducción

Este documento continúa la Fase 1, en la que se justificó la plataforma interna de verificación de entregas y su modelo de captura de valor. En esta fase se evalúa el estilo arquitectónico de la API, se presenta la arquitectura de software y se justifican los patrones de diseño aplicados. El contenido es coherente con la versión 1.1 de la Fase 1 y con el modelo C4 de la plataforma (`sistema-pruebas-entrega-1.5.dsl`), contrastado con el código del repositorio.

La plataforma está formada por una aplicación web progresiva en React, una API en Java 17 con Spring Boot 3.3 y una base de datos PostgreSQL 16 cuyo esquema gestiona Flyway. En producción, la aplicación web se publica en Cloudflare Pages y la API en una instancia de AWS EC2 y la base de datos en Amazon RDS for PostgreSQL. Cada patrón se clasifica según su estado real en el código (implementado, parcial o no implementado), y las brechas que persisten se recogen en el apartado 6.

## 2. Evaluación del estilo arquitectónico

Se compararon los tres estilos propuestos (REST, GraphQL y gRPC) frente a las condiciones reales del producto. El consumidor es una PWA que se ejecuta en el navegador del conductor, sobre redes móviles. Las operaciones son comandos discretos (confirmar, reportar, publicar) y consultas de forma fija, y la evidencia incluye fotografías.

### 2.1 Criterios de comparación

| Criterio | REST | GraphQL | gRPC |
|---|---|---|---|
| Cliente en el navegador | Soporte nativo con fetch o axios | Requiere cliente propio y un único endpoint POST | Sin soporte directo; exige gRPC-Web y un proxy adicional |
| Naturaleza de las operaciones | Recursos y acciones de dominio bien delimitados | Aporta en consultas flexibles que aquí no existen | Orientado a llamadas entre servicios |
| Evidencia fotográfica | Se entrega como image/jpeg directamente | Obliga a codificar en base64 o a usar otro endpoint | Eficiente en binario, pero no accesible desde el navegador |
| Autorización | Por ruta y método (/api/v1/admin/**) | Por campo o resolver, más compleja de auditar | Por metadatos e interceptores |
| Documentación y pruebas | OpenAPI, curl, k6 y scripts | Esquema propio; caché HTTP limitada | Contratos protobuf; herramientas especializadas |
| Esfuerzo en Spring Boot | Spring Web, ya dominado por el equipo | Esquema y resolvers adicionales | Generación de código y HTTP/2 extremo a extremo |
| Valoración | **Adecuado** | Sobredimensionado | No adecuado para el cliente actual |

### 2.2 Decisión: API REST versionada sobre JSON y HTTPS

Se adopta **REST** con recursos en JSON, verbos HTTP y códigos de estado estándar, en el nivel 2 del modelo de madurez de Richardson. HATEOAS no se incorpora porque el único consumidor es un cliente propio que conoce el contrato. Las decisiones de diseño del contrato son:

- **Versionado por ruta.** Los ocho controladores de negocio cuelgan de `/api/v1`, agrupados por actor (`/api/v1/auth`, `/api/v1/driver`, `/api/v1/admin`). Las rutas de infraestructura (`/actuator/health`, `/v3/api-docs`, `/swagger-ui`) no se versionan porque no forman parte del contrato de negocio.
- **Contrato documentado.** springdoc-openapi publica la especificación en `/v3/api-docs` y la interfaz Swagger en `/swagger-ui`, con el esquema de seguridad `sessionCookie` (`apiKey` en la cookie `access_token`). En los entornos desplegados, el Nginx de borde exige además usuario y contraseña (Basic Auth con `htpasswd`) para esas dos rutas.
- **Códigos con significado.** 201 con cabecera `Location` al crear, 204 al eliminar, 409 ante un conflicto de estado (entrega ya confirmada, integridad referencial), 422 ante un PIN inválido y 503 con el circuito abierto.
- **Error uniforme.** Todas las respuestas de error usan `{message, errors}`, de modo que el frontend las lee siempre igual.
- **Acciones de negocio.** `/confirm`, `/incident` y `/publish` se modelan como POST, un estilo cercano a RPC que se justifica porque representan comandos con reglas propias y no simples cambios de estado.

| Recurso | Rol | Propósito |
|---|---|---|
| POST /api/v1/auth/login | Público | Autentica y devuelve un JWT con el rol |
| GET /api/v1/driver/invoices?q=<br>GET /api/v1/driver/invoices/{id}/lines | Conductor, admin. | Busca facturas publicadas pendientes (máximo 20) y sus productos |
| POST /api/v1/driver/deliveries/confirm | Conductor, admin. | Confirma la entrega con PIN, GPS y fotografía |
| POST /api/v1/driver/deliveries/incident | Conductor, admin. | Reporta una incidencia sobre una factura existente |
| GET /api/v1/driver/deliveries/history<br>GET /api/v1/driver/deliveries/{id}/photo | Conductor, admin. | Historial propio paginado y su evidencia |
| GET, POST /api/v1/admin/invoices<br>POST /api/v1/admin/invoices/{id}/publish | Administración | Consulta y crea facturas; la publicación genera el PIN |
| GET /api/v1/admin/deliveries<br>GET /api/v1/admin/deliveries/{id}/photo | Administración | Historial global paginado y fotografía de evidencia |
| GET /api/v1/admin/dashboard/map\|metrics | Administración | Mapa y métricas por conductor en un rango de fechas |
| GET /api/v1/admin/cost?month=yyyy-MM<br>PUT /api/v1/admin/cost/support-hours | Administración | Costo por entrega verificada del mes y horas de soporte (showback de la Fase 1) |
| GET /api/v1/admin/resilience/status<br>POST /api/v1/admin/resilience/simulate-failures | Administración | Estado del Circuit Breaker y simulación de fallas del ERP |
| GET, POST, PUT, DELETE /api/v1/admin/users | Administración | Gestión de cuentas del equipo |

## 3. Arquitectura de software: modelo C4

La arquitectura se documenta con el modelo C4 en Structurizr (`sistema-pruebas-entrega-1.5.dsl`). La versión 1.5 parte de la 1.4 y solo cambia la vista de despliegue: la base de datos de producción es Amazon RDS (un nodo propio dentro de AWS, fuera de la EC2) en vez de un contenedor PostgreSQL. La versión 1.4 parte de la 1.3 (que ya coincidía con el código) y la actualiza tras la recalificación técnica en vivo de `docs/EVALUACION_TECNICA.md` §17/§18: el frontend migró a TypeScript, el adaptador de facturas dejó `JdbcTemplate` por Spring Data JPA, se agregaron el Retry y el Cache Aside junto al Circuit Breaker y al rate limiting del login, y la vista de despliegue ahora incluye el Nginx de borde de la EC2 y de dónde se descargan las imágenes versionadas (GHCR, publicadas por `.github/workflows/cd.yml`). No incluye elementos que no estén implementados. Las figuras se generaron directamente desde el modelo.

### 3.1 Diagrama de contexto (nivel 1)

La Figura 1 muestra la plataforma como un único sistema y a las dos personas que la usan. El conductor busca la factura, confirma la entrega o reporta una incidencia. La administración gestiona facturas y equipo, y supervisa entregas e incidencias.

No aparecen sistemas externos, por la decisión de alcance de la Fase 1. El ERP vigente se simula con datos propios que replican el contrato mínimo, y la distribución del PIN es manual: la administración exporta el PIN vigente a CSV y lo comunica al cliente por un canal operativo, y el cliente lo dicta al conductor al recibir el pedido.

![Figura 1. Diagrama de contexto de la plataforma (C4, nivel 1).](figuras/c4_contexto.png)

*Figura 1. Diagrama de contexto de la plataforma (C4, nivel 1).*

### 3.2 Diagrama de contenedores (nivel 2)

La Figura 2 descompone la plataforma en tres contenedores:

- **Aplicación web** (React 19, Vite y vite-plugin-pwa). Una sola SPA/PWA atiende a ambos roles; el rol autenticado determina las vistas.
- **API de verificación** (Java 17 y Spring Boot 3.3). API REST con arquitectura hexagonal que concentra autenticación, facturas, entregas, historial, costo por entrega y resiliencia, bajo `/api/v1` y documentada con OpenAPI.
- **Base de datos** (PostgreSQL 16). Guarda facturas, usuarios, historial de entregas con su evidencia y horas de soporte por mes. Su esquema lo gestiona Flyway (`V1__baseline.sql`), con claves foráneas e índices explícitos, y solo la API accede a ella, por JDBC.

La infraestructura que conecta estos contenedores depende del entorno: en local, la imagen del frontend usa Nginx como proxy de `/api/`; en producción, ese papel lo cumple Cloudflare (apartado 3.6). Por eso no se modela como un contenedor de la arquitectura.

![Figura 2. Diagrama de contenedores de la plataforma (C4, nivel 2).](figuras/c4_contenedores.png)

*Figura 2. Diagrama de contenedores de la plataforma (C4, nivel 2).*

### 3.3 Diagrama de componentes de la API (nivel 3)

La Figura 3 detalla la API. El recorrido de una petición muestra la ubicación de cada patrón:

- **Entrada y seguridad.** Las peticiones llegan al filtro JWT, que valida el token y aplica el rol de cada ruta: `/api/v1/auth` es público, `/v3/api-docs` y `/swagger-ui` no exigen JWT pero solo son alcanzables a través del Nginx de borde, que los protege con Basic Auth (`deploy/nginx/snippets/api-docs.conf`), `/api/v1/driver` admite CONDUCTOR y ADMIN, y `/api/v1/admin` exige ADMIN.
- **Controladores REST** (adaptadores de entrada): autenticación, conductor, facturas, equipo, historial, tablero, costos y resiliencia. El manejador global de excepciones traduce los errores de dominio a códigos HTTP con un formato único.
- **Servicios de aplicación**: autenticación, entregas, historial y métricas, gestión de equipo, gestión de facturas y costo por entrega. Cada controlador delega en su servicio a través de un puerto de entrada.
- **Circuit Breaker del ERP.** El breaker `erpGateway` se aplica dentro del adaptador de facturas y protege la consulta, la confirmación y la gestión de facturas. El simulador de fallas permite demostrar su ciclo desde el panel.
- **Adaptadores de salida**: repositorios de usuarios y de entregas (Spring Data JPA), adaptador de facturas (Spring Data JPA, que simula el ERP y controla los intentos del PIN con `@Lock(PESSIMISTIC_WRITE)`), adaptadores de tarifas y de horas de soporte, de tokens (HMAC-SHA256) y de contraseñas (BCrypt). Solo ellos acceden a la base de datos. La única excepción es `DemoInvoiceLoader`, que sigue en `JdbcTemplate` a propósito: es una carga masiva que preserva IDs explícitos de `demo/invoices.json` y resincroniza la secuencia de Postgres, algo que `GenerationType.IDENTITY` no permite en JPA.

El servicio de costo por entrega implementa el showback de la Fase 1 (apartado 4.5): combina el resumen SQL de entregas confirmadas y bytes de evidencia, sin cargar las fotografías, con las tarifas configuradas (`APP_COST_*`) y las horas de soporte del mes, que se editan desde el panel porque varían cada mes.

![Figura 3. Diagrama de componentes de la API de verificación (C4, nivel 3).](figuras/c4_componentes_api.png)

*Figura 3. Diagrama de componentes de la API de verificación (C4, nivel 3).*

### 3.4 Diagrama de componentes de la aplicación web (nivel 3)

La Figura 4 muestra las páginas de la aplicación web organizadas por rol. El conductor usa la pantalla del conductor y su historial. La administración usa la gestión de facturas, la gestión de equipo, el registro de entregas y el tablero administrativo, que incluye el costo por entrega, la edición de horas de soporte, el estado del Circuit Breaker y la simulación de fallas. Ambos roles comparten el inicio de sesión.

Todas las páginas llaman a la API a través de un único cliente HTTP (axios, `withCredentials: true`), apunta a `/api/v1` y cierra la sesión ante una respuesta 401. El JWT viaja en una cookie `HttpOnly` que fija el backend (`AuthController.setAuthCookie`); el navegador la adjunta solo, sin que el frontend la lea ni la reenvíe con un header. El contexto de autenticación guarda únicamente el usuario (no el token) en localStorage o sessionStorage, según la opción "Recuérdame".

![Figura 4. Diagrama de componentes de la aplicación web (C4, nivel 3).](figuras/c4_componentes_frontend.png)

*Figura 4. Diagrama de componentes de la aplicación web (C4, nivel 3).*

### 3.5 Vista dinámica: confirmación de una entrega

La Figura 5 recorre el flujo principal del sistema. En detalle, los pasos muestran cómo interactúan los patrones:

![Figura 5. Vista dinámica de la confirmación de una entrega.](figuras/c4_flujo.png)

*Figura 5. Vista dinámica de la confirmación de una entrega.*

- **Publicación y distribución del PIN.** Al publicar la factura, la API genera un PIN de seis dígitos. La administración lo comunica al cliente, que lo dicta al conductor al recibir el pedido.
- **Captura en campo.** La PWA obtiene la ubicación GPS, comprime la fotografía en el dispositivo (1280 px, calidad 0,7) y advierte si el punto está a más de 2 km de la dirección registrada.
- **Entrada y autenticación.** La solicitud pasa por el proxy de Cloudflare, que termina TLS, y llega a la API. El filtro JWT identifica al conductor y verifica su rol.
- **Validación del contrato.** El DTO exige un PIN de seis dígitos y coordenadas; la fotografía debe ser JPEG o PNG real (comprobado por sus primeros bytes) y no superar 5 MB.
- **Verificación protegida y transaccional.** La API obtiene la factura real desde la base (no confía en los datos que envía el cliente) y, a través del Circuit Breaker, en una sola transacción bloquea la factura, valida su estado y el PIN, registra la confirmación y guarda la evidencia con la distancia calculada.
- **Rechazo y bloqueo.** Si el PIN es incorrecto, la API responde 422, registra el intento fallido y, al quinto intento consecutivo, bloquea la factura durante 5 minutos. Una entrega ya confirmada responde 409.

### 3.6 Vista de despliegue

La Figura 6 muestra el despliegue de producción, elegido por su bajo costo para el piloto:

- **Cloudflare Pages** aloja los archivos estáticos de la PWA (build de Vite) y los distribuye desde su red.
- **DNS y proxy de Cloudflare** resuelven el dominio de la API, terminan TLS y ocultan la IP del servidor. Es el punto de entrada de todas las peticiones a la API (apartado 4.2).
- **Una instancia AWS EC2 con Elastic IP** ejecuta con Docker Compose el Nginx de borde y el contenedor de la API. La Elastic IP mantiene fija la dirección a la que apunta el DNS. El backend expone `/actuator/health` para el chequeo de salud y aplica las migraciones de Flyway al arrancar.
- **Amazon RDS for PostgreSQL** aloja la base de datos como servicio gestionado, fuera de la EC2 (ya no hay un contenedor de PostgreSQL en la VM). Su *security group* solo admite el puerto 5432 desde el de la EC2, el backend se conecta con TLS verificado (`DB_SSL_MODE=verify-full`, con la CA de RDS incluida en la imagen) y los respaldos son los *snapshots* automáticos de RDS. El contenedor `postgres` de `docker-compose.yml` (profile `db`) queda solo para desarrollo local.

![Figura 6. Vista de despliegue de producción.](figuras/c4_despliegue.png)

*Figura 6. Vista de despliegue de producción.*

Este despliegue implica decisiones que el código y la configuración deben reflejar:

- **Dominios distintos.** La PWA y la API quedan en orígenes diferentes. El cliente HTTP ya toma la URL de la API de `VITE_API_BASE_URL` (con `/api/v1` relativo como valor por defecto); Cloudflare Pages construye el sitio con su propia integración de Git (no GitHub Actions), y esa variable (junto con `VITE_MAP_TILES_URL`) se fija por entorno directamente en las *Environment variables* del proyecto de Pages (Production/Preview). El `CORS_ALLOWED_ORIGINS` del backend admite patrones de origen (`https://*.dominio`) para cubrir también las previews automáticas por PR que Cloudflare genera solo.
- **Teselas del mapa.** En local se sirven a través del proxy `/map-tiles/` de Nginx, y ese sigue siendo el valor por defecto. Ya son configurables con `VITE_MAP_TILES_URL`; en producción basta con fijar esa variable apuntando a OpenStreetMap o a un Worker de Cloudflare.
- **Enrutamiento de la SPA.** `frontend/public/_redirects` ya redirige cualquier ruta a `index.html`, para que recargar `/admin/dashboard` no dé 404 en Cloudflare Pages.
- **Secretos.** Fuera del modo demo, el arranque falla si `JWT_SECRET` o `ADMIN_PASSWORD` conservan el valor de ejemplo (`SecretsGuardRunner`), por lo que ambos deben definirse en la EC2.
- **Cifrado extremo a extremo.** Se recomienda el modo SSL Full (strict) con un certificado de origen de Cloudflare en la EC2, para que el tramo entre Cloudflare y AWS también vaya cifrado. El grupo de seguridad debe aceptar tráfico solo desde los rangos de IP de Cloudflare.
- **Punto único de falla.** Una sola máquina no tiene redundancia; para el piloto se acepta, con respaldos periódicos del volumen de PostgreSQL (instantáneas de EBS).

## 4. Patrones de diseño aplicados

La siguiente tabla resume los patrones y su estado real en el código. Los apartados siguientes justifican cada uno frente a los objetivos y riesgos definidos en la Fase 1.

| Patrón | Problema que resuelve | Aplicación en el código | Estado |
|---|---|---|---|
| Arquitectura hexagonal | Aislar el dominio del ERP y del framework | 19 puertos de entrada, 9 de salida y adaptadores | Implementado |
| Service Layer, Repository, Adapter y Mapper | Separar casos de uso, persistencia e integración | ApplicationService, RepositoryPort, adaptadores y mappers | Implementado |
| Proxy inverso en el borde | Punto único de entrada, TLS y ocultar el servidor | Cloudflare en producción; Nginx en local | Implementado |
| Autorización por rol en rutas | Separar los contratos del conductor y del panel | SecurityConfig: /api/v1/driver y /api/v1/admin | Implementado |
| Paginación, filtrado y proyecciones | Historial de crecimiento permanente | PageRequest, PageResponse, q, from/to, proyecciones JPA | Parcial |
| Seguridad sin estado (JWT) | Identificar al usuario sin sesión | JwtAuthenticationFilter, BCrypt | Implementado |
| Transacción única y bloqueo pesimista | Confirmaciones duplicadas o simultáneas | TransactionTemplate, SELECT … FOR UPDATE | Implementado |
| DTO y manejador global de errores | Contrato estable y errores uniformes | Records validados, @RestControllerAdvice | Implementado |
| Circuit Breaker | Fallas del ERP | Resilience4j, breaker erpGateway | Implementado |
| Rate limiting del login | Fuerza bruta contra `/api/v1/auth/login` | `LoginRateLimiter` (bucket4j): 5 intentos por IP+usuario cada 60s, 429 al exceder | Implementado |
| Retry | Fallas transitorias del ERP simulado | `resilience4j-retry`, retry `erpGatewayRetry` (3 intentos, backoff 200ms) solo en lecturas de `LocalInvoiceAdapter` | Implementado |
| Cache Aside | Repetir contra la base lecturas que no cambian tras crear la factura | Caffeine (`invoiceLines`, `expectedLocation`, TTL configurable) en `LocalInvoiceAdapter` | Implementado |

### 4.1 Arquitectura hexagonal (puertos y adaptadores)

El dominio define 19 puertos de entrada (un caso de uso por operación) y 9 de salida. Este patrón materializa dos principios de la Fase 1: **no intervención del ERP** y **aislamiento del dominio**. Hoy, `LocalInvoiceAdapter` implementa los puertos de facturas sobre la base propia, que replica el contrato mínimo del ERP. En la integración productiva bastará con un adaptador del ERP, sin modificar servicios, reglas ni controladores. Alrededor del núcleo se aplican además los patrones Service Layer, Repository, Adapter y Mapper, con inyección de dependencias por constructor.

Los puertos de facturas se separan por consumidor, siguiendo el principio de segregación de interfaces: `InvoiceQueryPort` ofrece al conductor solo la lectura de facturas pendientes, mientras que `InvoiceAdminPort` expone a la administración la creación, la publicación y el PIN. Así, el controlador de facturas depende de un caso de uso (`ManageInvoicesUseCase`) y no del adaptador. El desacoplamiento alcanza detalles como la paginación, que el dominio modela con `PageRequest` y `PageResult` en lugar del `Pageable` de Spring Data.

### 4.2 Proxy inverso en el borde

Todas las peticiones a la API entran por un proxy inverso antes de llegar a la aplicación. En producción es el proxy de Cloudflare: resuelve el dominio, termina TLS, oculta la IP de la instancia EC2 y absorbe tráfico malicioso antes de que llegue al servidor. En el entorno local, el mismo papel lo cumple el Nginx de la imagen del frontend, que enruta `/api/` hacia la API.

No es un API Gateway completo: no agrega llamadas ni aplica cuotas por consumidor. Se descartó un gateway dedicado (Amazon API Gateway o Kong) porque existe un solo backend y los consumidores son internos. El inicio de sesión ya tiene su propia protección contra fuerza bruta (`LoginRateLimiter`, apartado 4.9); reglas de limitación de tasa de Cloudflare a nivel de borde quedan como una capa adicional, no como la única mitigación.

### 4.3 Autorización por rol en rutas

El conductor trabaja en campo con conectividad limitada y necesita respuestas mínimas: su búsqueda devuelve como máximo 20 facturas publicadas y pendientes, sin exponer el PIN. El panel requiere agregados (mapa, métricas, costo) y datos sensibles. Por eso los contratos se separan en `/api/v1/driver` y `/api/v1/admin`, y el backend aplica el rol de cada ruta de forma independiente del frontend; una prueba `@WebMvcTest` verifica los códigos 401 y 403 contra la configuración de seguridad real.

Se evaluó el patrón BFF (un backend por cada frontend) y se descartó: hay una sola PWA, un solo equipo y una sola API, por lo que duplicaría el despliegue sin beneficio. La separación por prefijo deja abierta la opción de extraer un BFF más adelante sin romper a los clientes.

### 4.4 Paginación, filtrado y proyecciones

La evidencia se custodia de forma permanente, por lo que el historial crece sin límite. Los listados de intentos usan paginación por desplazamiento con los parámetros `page` y `size` (20 por defecto) y un orden fijo por fecha descendente. La respuesta `PageResponse` incluye `content`, `page`, `size`, `totalElements` y `totalPages`. El filtrado combina búsqueda textual (`q`) y rango temporal ISO 8601 (`from`, `to`).

Las consultas de listado, mapa y métricas usan proyecciones JPA que no cargan la columna de la fotografía, y las métricas se agregan con `GROUP BY` en SQL. Con 500 entregas con fotos de unos 200 KB, esta corrección bajó el p95 del tablero de 21,91 s a 13,33 ms en las pruebas de carga con k6. `PageRequest` ya limita `size` a un máximo de 100 (responde 400 si se supera). El patrón sigue siendo **parcial**: el listado de facturas usa un límite fijo de 1000 filas, el de usuarios no pagina y no existe ordenamiento configurable.

### 4.5 Seguridad sin estado con JWT

La API no mantiene sesiones. El inicio de sesión devuelve un JWT firmado con HMAC-SHA256, con expiración configurable (480 minutos, equivalente a un turno). Un filtro valida el token en cada solicitud y bloquea de inmediato a los usuarios desactivados. Las contraseñas se almacenan con BCrypt, y un administrador no puede desactivarse ni eliminarse a sí mismo (409).

La identidad del conductor se obtiene del token y no del cuerpo de la solicitud, y sus fotografías se filtran por su identificador, lo que evita el acceso a datos ajenos. Al no depender de sesiones, la API puede escalar horizontalmente sin estado compartido. El PIN se mantiene en texto plano por decisión deliberada: la Fase 1 exige que la administración pueda leerlo para comunicarlo al cliente, y la mitigación elegida es el bloqueo por intentos (apartado 4.6).

### 4.6 Integridad transaccional y control de concurrencia

La confirmación es la operación crítica. Primero se obtiene la factura real desde la base; después, en una sola transacción, se bloquea su fila (`SELECT … FOR UPDATE`) y se valida que esté publicada, requiera PIN, no haya sido confirmada, no esté bloqueada y que el PIN coincida. Luego se registran la hora, la ubicación, el conductor, la fotografía y la distancia a la dirección esperada. Nunca queda una entrega sin evidencia ni una evidencia sin entrega.

Si el PIN es incorrecto, la transacción se revierte y el intento fallido se registra en una transacción separada, para que el contador no se pierda con el rollback; al quinto fallo consecutivo la factura queda bloqueada 5 minutos, lo que cumple la mitigación de la Fase 1 contra la adivinación del PIN. La regla de "ya confirmada" vuelve la operación idempotente: un reintento de la PWA por mala señal no genera un segundo registro. Una prueba de integración con Testcontainers lanza 8 confirmaciones concurrentes sobre la misma factura contra un PostgreSQL real y verifica que solo una tiene éxito.

### 4.7 DTO y manejo centralizado de errores

El contrato público se desacopla del modelo interno mediante DTO inmutables (records) con Bean Validation: PIN de seis dígitos, coordenadas dentro de rango, notas de incidencia de hasta 500 caracteres y cantidades positivas. Las facturas del panel tienen su propio DTO (`AdminInvoiceResponse`), en camelCase como el resto de la API.

Un manejador global traduce las excepciones de dominio a códigos HTTP en un único lugar, con el formato `{message, errors}`: 400 por validación, 401 por credenciales, 403 por permisos, 404 si el recurso no existe, 409 por conflictos de estado o de integridad, 422 por PIN inválido, 429 por exceso de intentos de login y 503 con el circuito abierto o ante una falla de almacenamiento. Así, el dominio no depende de HTTP y el frontend interpreta todos los errores de la misma manera.

### 4.8 Circuit Breaker

El riesgo de la Fase 1 sobre la integración con el ERP se aborda con un Circuit Breaker de Resilience4j. El breaker `erpGateway` se construye en `ResilienceConfig` y se aplica dentro del adaptador de facturas (`protectedCall`), de modo que protege la consulta, la confirmación y la gestión de facturas, que son las operaciones que en producción irían al ERP. Está activo por defecto (`APP_CIRCUIT_BREAKER_ENABLED`).

Su configuración es la siguiente: el circuito se abre cuando falla el 50 % de las llamadas en una ventana de 10, con un mínimo de 5 llamadas; permanece abierto 15 segundos, durante los cuales la API responde 503 de inmediato en lugar de acumular peticiones bloqueadas; y luego pasa a semiabierto, donde permite 3 llamadas de prueba antes de volver a cerrarse. Los errores de negocio (`DeliveryRejectedException`, que incluye el PIN incorrecto y la entrega ya confirmada) se excluyen del conteo, de modo que solo las fallas técnicas abren el circuito.

Para demostrar el ciclo sin depender de un ERP real, `SimulatedErpFailureToggle` fuerza un número de fallas dentro de las llamadas protegidas (`POST /api/v1/admin/resilience/simulate-failures`, entre 1 y 50), y `GET /api/v1/admin/resilience/status` expone el estado desde el panel. En la prueba de carga con picos de 750 usuarios virtuales, el breaker terminó cerrado y sin llamadas rechazadas, lo que confirma que no se abre por carga normal.

### 4.9 Rate limiting del login

El inicio de sesión es el único endpoint público, y el mínimo de 6 caracteres en la contraseña lo vuelve un blanco de fuerza bruta. `LoginRateLimiter` usa bucket4j en memoria para limitar los intentos por combinación de IP y usuario, configurable con `LOGIN_RATE_LIMIT_ATTEMPTS` y `LOGIN_RATE_LIMIT_WINDOW_SECONDS` (5 intentos por 60 segundos por defecto). Al exceder el límite, `TooManyLoginAttemptsException` responde 429. No depende de Redis ni de infraestructura externa, adecuado para el volumen de un piloto de una sola instancia.

### 4.10 Retry

Antes solo el Circuit Breaker protegía la simulación del ERP (`LocalInvoiceAdapter`); un fallo aislado y transitorio ya abría una fracción de la ventana de fallos del breaker sin necesidad, porque no existía ningún reintento previo. `erpGatewayRetry` (Resilience4j) reintenta hasta 3 veces, con espera de 200ms, únicamente las lecturas idempotentes del adaptador (`searchPendingDeliveryInvoices`, `findInvoiceLines`, `findExpectedLocation`, `findById`, `list`); las escrituras (`confirmDelivery`, `publish`, `create`, `registerFailedPinAttempt`) se excluyen a propósito, porque ya sostienen un bloqueo pesimista de fila (`SELECT … FOR UPDATE` vía JPA) y reintentarlas prolongaría ese bloqueo sin necesidad. El retry ignora explícitamente las excepciones de negocio (`DeliveryRejectedException`) y la señal de circuito abierto (`CallNotPermittedException`), para no ocultar ninguna de las dos bajo una capa de reintentos.

`SimulatedErpFailureToggle` permite demostrar la diferencia entre ambos patrones desde el panel: simular 2 fallos (menos que los 3 intentos configurados) hace que el Retry los absorba por completo, sin que quien llama note nada y sin que el Circuit Breaker llegue a abrirse; simular 6 fallos sigue reintentando cada llamada, pero la racha es lo bastante larga para que el breaker también termine abriéndose. `GET /api/v1/admin/resilience/status` expone las métricas de ambos (`retrySuccessfulCallsWithRetry`, etc.).

### 4.11 Cache Aside

Las líneas de una factura y su ubicación esperada no cambian una vez creada la factura (`create()` es la única escritura de esos dos datos), así que repetir la consulta contra la base en cada petición del conductor es trabajo evitable. Dos caches en memoria con Caffeine (`invoiceLines`, `expectedLocation`, TTL configurable por variable de entorno) se aplican con `@Cacheable` directamente en `LocalInvoiceAdapter`, sin que el dominio se entere: son un detalle de la infraestructura, no del puerto de salida. Una prueba de integración con Testcontainers verifica, con un `@SpyBean` sobre el repositorio JPA, que la segunda llamada a `findInvoiceLines` para la misma factura no vuelve a tocar la base de datos.

## 5. Alternativas descartadas o diferidas

| Alternativa | Motivo | Condición para reconsiderarla |
|---|---|---|
| GraphQL | Consultas fijas y pocas vistas; complica la autorización y la caché | Panel con vistas configurables o consumidores externos |
| gRPC | Sin soporte nativo en el navegador | Comunicación interna de alto volumen con el ERP u otros servicios |
| BFF | Un solo cliente, un solo equipo y una sola API | Aplicaciones nativas u otros canales con necesidades divergentes |
| API Gateway dedicado (Amazon API Gateway, Kong) | Un solo backend y consumidores internos | Varios servicios o cuotas por credencial para el showback |
| Paginación por cursor | El desplazamiento basta para el volumen del piloto | Historial masivo o desplazamiento infinito en la PWA |
| Eventos en vivo (SSE) | El panel consulta bajo demanda por rango de fechas | Necesidad operativa de seguimiento en tiempo real |
| Hash del PIN | La administración debe leer el PIN para comunicarlo (Fase 1) | Envío automático del PIN por un proveedor de mensajería |

## 6. Brechas técnicas y plan de evolución

La evaluación técnica del repositorio resolvió la mayoría de las brechas anteriores (XSS del panel, límite de intentos del PIN, datos de evidencia tomados del cliente, violación hexagonal del controlador de facturas, contrato sin versionar ni documentar, consultas pesadas del tablero, secretos por defecto, rate limiting del login, descripciones de OpenAPI de los endpoints principales, cobertura de pruebas en los paquetes más críticos, manejo de errores del panel y el tamaño de `DriverHomePage`). En una ronda posterior se cerraron ademas: Retry y Cache Aside (apartados 4.10/4.11); `LocalInvoiceAdapter` y el costo operativo migrados de `JdbcTemplate` a JPA (misma estrategia de persistencia en todo el backend, salvo la carga masiva de datos de demostracion, que preserva IDs explicitos a proposito); `@Operation`/`@ApiResponse` curados en los 8 controladores de negocio (23/23 operaciones con `summary`, exportado como contrato real en `docs/openapi.json`); `CHECK` de estado en `delivery_invoice`; y un limite de 93 dias en el rango de fechas del tablero. El indice trigram de esa misma migracion (V2) quedo sobre la columna cruda mientras la busqueda real filtra por `lower(columna)`, asi que nunca lo llegaba a usar (verificado con `EXPLAIN`); una migracion posterior (V3) lo reemplazo por un indice funcional sobre `lower(number)`/`lower(partner_name)`, ya usado por el planner.

En una ronda mas reciente, ya con push real a `origin` y CI/CD corriendo en GitHub Actions, se cerraron ademas: paginacion HTTP real (`page`/`size`) en `GET /api/v1/admin/invoices` y `/admin/users`; el JWT dejo de viajar en `localStorage`/`Authorization: Bearer` y ahora va en una cookie `HttpOnly` que fija el backend (ver 3.4 y `AuthController.setAuthCookie`); y la auditoria de facturas (`created_by`/`published_by`, migracion `V5__invoice_audit_columns.sql`). La cobertura de pruebas tambien subio de forma sustancial: **136 pruebas de backend** (antes 24) con JaCoCo en **~80 % de instrucciones**, y **25 pruebas de frontend** con Vitest (antes 9). Las limitaciones que persisten, ordenadas por prioridad, son:

| Brecha | Riesgo | Acción propuesta |
|---|---|---|
| PIN en texto plano (decisión deliberada) | Exposición de los PIN vigentes ante una fuga | Cifrado reversible en reposo; hash cuando el envío del PIN se automatice |
| Sin cola de envíos sin conexión | Falta de cobertura de red (riesgo de la Fase 1) | IndexedDB y sincronización diferida; la idempotencia ya admite reintentos |

## 7. Conclusión

REST versionado y documentado con OpenAPI es el estilo que mejor se ajusta a un cliente web en campo, a operaciones de negocio discretas y a evidencia fotográfica, con el menor costo para el equipo. El modelo C4 muestra dónde se aplica cada patrón: el proxy inverso en el borde, la autorización por rol en la entrada, la arquitectura hexagonal en el núcleo, el Circuit Breaker frente al ERP y la transacción con bloqueo en la confirmación de entregas.

Los patrones están respaldados por evidencia verificable: pruebas de integración contra una base real, pruebas de carga con k6 y un ciclo del Circuit Breaker demostrable desde el panel. La paginación (`page`/`size`) en `GET /api/v1/admin/invoices` y `/admin/users`, y la cookie `HttpOnly` para el token JWT, ya se implementaron; el CI/CD en GitHub Actions ya corre de verdad (build, pruebas, release semántico y publicación en GHCR), y Cloudflare Pages sirve el frontend en producción real. la API corre en una instancia EC2 con RDS, y las pruebas de carga ya se ejecutaron contra ese entorno. Las limitaciones que se mantienen son decisiones declaradas (PIN en texto plano y ausencia de cola de envíos sin conexión), recogidas en el apartado 6.

---

## Anexo A. Verificación contra el código

Esta ronda de validación contó los archivos de puertos y revisó el frontend contra el código actual. Los siete puntos que traía esta version ya estan confirmados y corregidos:

- **Puertos de entrada y salida.** El conteo real es 19 archivos en `domain/port/in` y 9 en `domain/port/out` (no 17 y 7, dato de `EVALUACION_TECNICA.md` que no incluía `GetOperationalCostUseCase`, `SetSupportHoursUseCase`, `CostRatesPort` ni `OperationalCostInputPort`). Ya corregido en la tabla del apartado 4 y en 4.1.
- **Teselas del mapa.** Ya son configurables con `VITE_MAP_TILES_URL` (`AdminDashboardPage.tsx`, `DriverHistoryPage.tsx`); el valor por defecto sigue siendo `/map-tiles/` del Nginx local. Reflejado en 3.6 y en la tabla de brechas.
- **Valores de compresión de la PWA.** Confirmados exactos en `DriverHomePage.tsx`: 1280 px, calidad 0,7 y aviso a más de 2 km. No requirió cambios en 3.5.
- **Imagen base del backend.** Confirmado `eclipse-temurin 17` en `backend/Dockerfile` (build con `maven:3.9.9-eclipse-temurin-17`, runtime `eclipse-temurin:17-jre-jammy`); coincide con el nodo "Contenedor backend" del DSL.
- **Enrutamiento de la SPA en Cloudflare Pages.** Ya existe `frontend/public/_redirects` (`/* /index.html 200`). Reflejado en 3.6.
- **Compose de producción para la EC2 (resuelto).** `deploy/docker-compose.yml` ya existe: nginx + backend + Postgres opcional, parametrizado por `--env-file deploy/env/<entorno>.env` y por profiles (`db`, `frontend`, `demo`); sin datos demo por defecto, con `JWT_SECRET`/`ADMIN_PASSWORD` propios exigidos por `SecretsGuardRunner`. Reflejado en 3.6.
- **Cómo llega Cloudflare a la EC2 y dónde se termina TLS (resuelto).** `deploy/nginx/templates/api.conf.template` + `deploy/nginx/snippets/tls.conf`: el Nginx de la EC2 termina el TLS de origen (Cloudflare en modo Full strict) y reenvía `/api/` al contenedor backend; ya está agregado como nodo de infraestructura (`nginx`) en la vista de despliegue de `sistema-pruebas-entrega-1.5.dsl`.

**Carpeta `figuras/` (resuelto).** Las seis imágenes de la tabla de abajo ya se generaron desde `sistema-pruebas-entrega-1.5.dsl` y existen en el repositorio: `structurizr-cli` (imagen Docker `structurizr/cli:2025.11.09`, que trae Graphviz) exportó las seis vistas a DOT y se renderizaron a PNG con `dot -Tpng`. La vista dinámica se probó también exportada a Mermaid y renderizada con `mermaid-cli`, pero el resultado tenía texto superpuesto sobre las flechas; se usó la versión Graphviz, más legible. Al exportar `C4-Componentes-API` un `->` dentro de la descripción del Circuit Breaker (texto libre, no relación del modelo) rompía el parser de etiquetas HTML de Graphviz; se corrigió el texto en el `.dsl` ("Circuito abierto -> 503" pasó a "Circuito abierto: responde 503") sin cambiar su significado.

### Figuras

| Figura | Vista en `sistema-pruebas-entrega-1.5.dsl` | Archivo |
|---|---|---|
| 1 | `C4-Contexto` | `figuras/c4_contexto.png` |
| 2 | `C4-Contenedores` | `figuras/c4_contenedores.png` |
| 3 | `C4-Componentes-API` | `figuras/c4_componentes_api.png` |
| 4 | `C4-Componentes-Frontend` | `figuras/c4_componentes_frontend.png` |
| 5 | `Flujo-Confirmar-Entrega` | `figuras/c4_flujo.png` |
| 6 | `C4-Despliegue` | `figuras/c4_despliegue.png` |
