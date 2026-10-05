# DOCUMENTO DE VISIÓN DEL PRODUCTO Y MODELO DE NEGOCIO DE LA API

**Plataforma interna de verificación de entregas para la empresa de retail analizada**

## Fase 1 - Justificación de Negocio (RA1)

| Campo | Información |
|---|---|
| **Autores** | Aliatis Enzo<br>Cadme Mauro<br>Murillo Jordan<br>Suárez Galo |
| **Asignatura** | Patrones de Diseño de APIs |
| **Docente** | Patsy Malena Prieto Vélez |
| **Versión** | 1.1 |
| **Fecha** | 26 de septiembre de 2026 |
| **Estado** | Aprobado |

---

## Contenido

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Problema y oportunidad](#2-problema-y-oportunidad)
3. [Solución y alcance](#3-solución-y-alcance)
   - [3.1 Principios estratégicos](#31-principios-estratégicos)
   - [3.2 Anatomía y naturaleza de la API](#32-anatomía-y-naturaleza-de-la-api)
4. [Justificación económica y captura de valor](#4-justificación-económica-y-captura-de-valor)
   - [4.1 Impacto económico](#41-impacto-económico)
   - [4.2 El costo de marca](#42-el-costo-de-marca)
   - [4.3 Valor de la solución](#43-valor-de-la-solución)
   - [4.4 Cadena de valor de la API](#44-cadena-de-valor-de-la-api)
   - [4.5 Forma de monetización](#45-forma-de-monetización)
5. [Ventaja competitiva y riesgos](#5-ventaja-competitiva-y-riesgos)
   - [5.1 Riesgos prioritarios y mitigación](#51-riesgos-prioritarios-y-mitigación)
   - [5.2 Indicadores de éxito](#52-indicadores-de-éxito)
6. [Conclusión](#6-conclusión)

---

## 1. Resumen ejecutivo

La organización opera en el sector retail y distribuye mercadería al cliente final mediante flota propia, sin intermediarios logísticos. Esto convierte cada entrega en un proceso logístico y, al mismo tiempo, en un punto directo de contacto con la marca. El problema central es la ausencia de evidencia integrada que permita acreditar que cada entrega ocurrió y resolver reclamos de forma objetiva.

La solución es una plataforma interna con tres componentes: API de verificación, PWA del conductor y panel administrativo. Cada entrega se valida con PIN de un solo uso, fotografía y geolocalización. El valor esperado es reducir merma y trabajo administrativo, resolver reclamos con evidencia y proteger la confianza del cliente y al personal de reparto.

**Decisión recomendada:** ejecutar un piloto con el flujo completo de verificación sobre un entorno de datos que replica el contrato mínimo del ERP vigente, a fin de validar la utilidad de la evidencia y definir el esquema de medición de la línea base previo a la integración productiva.

## 2. Problema y oportunidad

El ERP vigente registra qué debe entregarse, pero no acredita de forma integrada la autorización del destinatario, la hora, la ubicación y la evidencia visual. Cuando un pedido no llega, la empresa pierde mercadería y tiempo operativo, y también incumple una promesa con fecha que una reposición tardía puede no reparar.

- **Costo operativo.** La pérdida reúne mercadería, posible reentrega y tiempo administrativo.
- **Decisión sin evidencia.** Desconfiar del cliente deteriora la relación; reponer siempre habilita abusos.
- **Costo de marca.** Una entrega fallida puede reducir la recurrencia y amplificarse en reseñas y recomendaciones.
- **Riesgo laboral.** El conductor queda expuesto a acusaciones que no pueden verificarse objetivamente.

La plataforma incorpora evidencia verificable sin sustituir el ERP. Así permite resolver reclamos según los hechos, comunicar control al cliente y respaldar al conductor.

## 3. Solución y alcance

La visión del producto es convertir cada entrega en un evento verificable, mediante una plataforma interna integrada por la API, la PWA del conductor y el panel administrativo, sin sustituir el ERP vigente.

La API genera y valida el PIN, contrasta fotografía y geolocalización y custodia la evidencia, es decir, la conserva íntegra, recuperable y con retención permanente; la PWA captura el evento en campo; y el panel permite seguimiento, historial, métricas e incidencias.

- **PIN de un solo uso.** Se genera automáticamente al confirmarse el comprobante y se transmite únicamente al destinatario. Acredita que la persona correcta autorizó la recepción.
- **Evidencia fotográfica.** Se captura en el momento de la entrega, se procesa en el dispositivo y queda asociada de forma permanente al comprobante.
- **Geolocalización validada.** La ubicación de la confirmación se contrasta con la dirección registrada del cliente; una desviación significativa genera una advertencia antes de permitir continuar.

### Alcance

| Incluido en el alcance | Fuera del alcance |
|---|---|
| **API:** generación, distribución y validación del PIN; validación de fotografía y geolocalización; custodia de evidencia | Gestión de inventario, facturación o contabilidad |
| **Aplicación del conductor (PWA):** captura de PIN, fotografía, ubicación y estado de la entrega en campo | Planificación y optimización de rutas |
| **Panel administrativo:** seguimiento, historial, métricas e incidencias | Venta a terceros, integradores, marca blanca, aseguradoras o financiadores |
| Intercambio del contrato mínimo de datos del comprobante con el ERP vigente. En esta fase se opera sobre un entorno de datos simulado que replica dicho contrato. | Capacidades premium u otros módulos no descritos |
| Único caso de uso: reparto a domicilio del cliente final | Retiros, devoluciones, visitas técnicas, cobranza u otros eventos físicos |

### 3.1 Principios estratégicos

- **No intervención del ERP.** La API intercambia únicamente la información necesaria mediante mecanismos autorizados.
- **Contrato mínimo de datos.** Se limita al comprobante, destinatario, dirección, contacto e ítems.
- **Aislamiento del dominio.** La verificación permanece separada de inventario, facturación, contabilidad y gestión comercial.

### 3.2 Anatomía y naturaleza de la API

**Naturaleza.** Es una API REST **privada (interna)**: no se publica a terceros ni se
comercializa. La consumen dos clientes propios, la PWA del conductor y el panel
administrativo, y se apoya en un ERP simulado que representa al sistema vigente de la
empresa. Es una API de **proceso** (ejecuta acciones de negocio como confirmar una entrega)
y de **datos** (expone facturas, historial y métricas).

**Anatomía de una petición.** Tomando como ejemplo la confirmación de una entrega:

| Elemento | En esta API |
|---|---|
| **URI y versión** | `/api/v1/driver/deliveries/confirm`; el primer segmento fija la versión y el segundo, el rol que la consume |
| **Verbo** | `POST`: ejecuta una acción que cambia el estado |
| **Autenticación** | Cookie `access_token` (JWT, `HttpOnly`) obtenida en `POST /api/v1/auth/login` |
| **Cabeceras propias** | `X-XSRF-TOKEN` (protección CSRF) e `Idempotency-Key` (reintentos seguros) |
| **Cuerpo (JSON)** | `invoiceId`, `pin`, `latitude`, `longitude`, `photoBase64` |
| **Respuesta correcta** | `200` con `{ "success": true, "message": "...", "photoUploaded": true }` |
| **Respuesta de error** | Una sola forma, `{ "message", "path", "timestamp" }`, con el código HTTP que corresponde: 400, 409, 422, 429 o 503 |

## 4. Justificación económica y captura de valor

Al tratarse de una API de uso interno, el modelo de negocio no se basa en la comercialización del servicio a terceros, sino en la captura interna del valor generado: reducción de merma, eficiencia operativa y protección de la relación con el cliente. Los apartados siguientes desarrollan esa captura de valor y la cadena que la produce.

### 4.1 Impacto económico

La pérdida de paquetes representa una merma real que la organización ya asume cuando no existe evidencia de entrega, generando costos por reposición del producto, reentrega, gestión administrativa y deterioro de la relación con el cliente.

En un negocio de márgenes estrechos, evitar estas pérdidas tiene un impacto directo en la rentabilidad. Actualmente esta pérdida no se distingue como categoría propia: se diluye entre reposiciones, ajustes de inventario y reclamos de servicio.

Registrar cada entrega e incidencia con su motivo, ubicación y responsable permite identificar esta merma como una categoría específica, cuantificarla con datos de la operación y convertirla en una pérdida medible, atribuible y gestionable.

### 4.2 El costo de marca

Un pedido es una promesa con fecha. El cliente no compró un producto en abstracto: lo pidió porque lo necesitaba en un momento concreto. Cuando el paquete no llega, lo que falla no es el inventario sino ese momento, y una reposición posterior ya no repara la necesidad original.

La unidad de pérdida real es el cliente, no el producto. Reponer cierra el incidente contablemente, pero no restituye la confianza: el cliente afectado reduce su frecuencia de compra o migra a un competidor, y ese valor no se registra en ninguna cuenta de merma. La confianza además es asimétrica, se construye a lo largo de muchas entregas correctas y se quiebra con una sola fallida, cuyo relato se amplifica en reseñas y recomendaciones.

Sin evidencia, la empresa enfrenta un dilema que no puede ganar: desconfiar del cliente deteriora la relación y la reputación; reponer siempre sin verificar la protege, pero habilita el abuso interno y externo. La verificación resuelve ese dilema, porque permite responder con generosidad al cliente legítimo y con firmeza donde efectivamente hubo fraude.

El efecto es también positivo. La notificación del PIN constituye un punto de contacto que comunica control del proceso, y el sistema resguarda al personal de reparto frente a acusaciones infundadas, lo que favorece la adopción interna.

### 4.3 Valor de la solución

La solución integra PIN, fotografía y geolocalización como evidencia asociada al comprobante de entrega. Esto permite:

- reducir pérdidas y reentregas;
- resolver reclamos con evidencia verificable;
- mejorar la trazabilidad de la operación;
- respaldar al personal de reparto;
- fortalecer la confianza del cliente.

También reduce el riesgo en modalidades como entrega a domicilio, pago contra entrega o atención corporativa, cuando formen parte de la operación existente. El modelo maximiza el valor del cliente al proteger su confianza, facilitar la resolución objetiva de incidencias y favorecer su retención después de una experiencia de entrega adversa.

| Aspecto | Situación actual | Situación objetivo |
|---|---|---|
| **Entrega** | Evidencia no integrada ni asociada al comprobante | Entrega verificada mediante PIN, fotografía y ubicación |
| **Reclamos** | Resolución con información limitada | Resolución sustentada en evidencia |
| **Trazabilidad** | Registros dispersos o insuficientes | Evidencia centralizada y asociada al comprobante |
| **Cliente y conductor** | Sin respaldo verificable ante incidencias | Mayor trazabilidad y respaldo para ambas partes |

### 4.4 Cadena de valor de la API

La cadena de valor de la API se estructura en cuatro eslabones. El valor lo captura la propia organización, no un tercero que pague por consumir el servicio.

| Eslabón | Qué aporta | Dónde reside el valor |
|---|---|---|
| **Captura del evento** | La PWA recoge PIN, fotografía y ubicación en el punto de entrega | Es el eslabón más difícil de replicar: exige presencia física en el momento exacto |
| **Verificación** | La API contrasta los tres factores y determina si la entrega puede confirmarse | Núcleo del producto; concentra la lógica que hace confiable la evidencia |
| **Custodia de la evidencia** | Conserva la prueba vinculada al comprobante, íntegra y recuperable | Su valor crece con el historial acumulado |
| **Distribución** | Expone el evento verificado al panel administrativo y al ERP vigente | Convierte la evidencia en decisiones: resolución de reclamos y métricas de operación |

El valor se captura mediante la reducción de merma, reentregas y esfuerzo administrativo, y mediante una mayor trazabilidad y capacidad de resolver incidencias con información verificable.

### 4.5 Forma de monetización

Al ser una API interna, su monetización no consiste en cobrar a terceros. Se basa en un modelo de **showback por entrega verificada**: cada entrega confirmada tiene un costo unitario que se informa mensualmente al área de logística, sin generar cargos contables.

El modelo es fácil de implementar, porque la API ya registra cada entrega verificada y no requiere facturación ni pagos.

**Costo por entrega verificada:**

```text
(Infraestructura + Almacenamiento de evidencia + Envío de PIN + Soporte)
÷ Entregas verificadas del mes
```

| Componente | Origen del dato |
|---|---|
| **Infraestructura** | Costo del proveedor de nube o asignado por TI |
| **Almacenamiento de evidencia** | Volumen almacenado por la tarifa vigente |
| **Envío de PIN** | Mensajes enviados, incluidos reenvíos, por costo del canal |
| **Soporte** | Horas del equipo técnico asignadas al servicio |
| **Entregas verificadas** | Registro propio de la API |

### Ejemplo ilustrativo

El siguiente cálculo aplica la fórmula con supuestos hipotéticos para un mes de 3.000 entregas verificadas. Los valores reales se obtendrán durante el piloto. Las dos primeras filas (entregas verificadas y almacenamiento de evidencia) las calcula el propio sistema; infraestructura y soporte se toman de la factura del proveedor y del registro de horas del equipo, respectivamente. El envío de PIN se muestra por separado porque en este piloto el PIN se comunica al cliente por un canal manual, sin automatización ni costo variable medido por el sistema.

| Componente | Supuesto | Costo mensual (USD) |
|---|---|---:|
| Infraestructura | Servidor en la nube y base de datos administrada | 60 |
| Almacenamiento de evidencia | 3.000 fotos de unos 250 KB (≈ 0,75 GB por mes), con respaldo | 2 |
| Soporte y mantenimiento | 10 horas técnicas a USD 12 por hora | 120 |
| **Total (piloto actual)** | | **182** |

Costo por entrega verificada (piloto actual) = 182 ÷ 3.000 ≈ **USD 0,06**

Para contrastarlo con el valor capturado, se supone un pedido promedio de USD 35 y un costo de reentrega de USD 4. Con esos valores, el servicio se paga por sí mismo si evita unas 5 reposiciones al mes (182 ÷ 39 ≈ 4,7). Eso equivale al 0,16 % de las entregas.

**Proyección a futuro (envío de PIN automatizado).** Si en una fase posterior se integra un proveedor de mensajería para enviar el PIN automáticamente, se sumarían unos 3.300 mensajes al mes (incluye 10 % de reenvíos) a USD 0,03 cada uno: **USD 99 adicionales**. El total pasaría a USD 281 y el costo por entrega a USD 0,09, sin cambiar sustancialmente el punto de equilibrio (7,2 reposiciones, 0,24 % de las entregas). El envío del PIN sería entonces el costo variable más alto, por lo que usar correo o notificaciones cuando el cliente lo permita reduciría el costo unitario.

El panel administrativo muestra este costo por sucursal o zona, junto con los indicadores del apartado 5.2. Durante el piloto, el reporte será informativo. Más adelante, la organización podrá imputarlo al centro de costo de logística si lo considera útil.

Comparar este costo con la merma, las reentregas y el tiempo administrativo evitados permitirá demostrar que la API genera valor y no es solo un gasto tecnológico.

## 5. Ventaja competitiva y riesgos

La ventaja de la plataforma reside en combinar verificación multifactor y evidencia centralizada con una integración controlada sobre el ERP vigente.

Las alternativas disponibles obligan a optar entre un registro débil —una firma o una fotografía aislada, insuficientes como prueba— o la sustitución del sistema de gestión. La plataforma evita ambos extremos: eleva el estándar de evidencia sin intervenir los sistemas que soportan la operación.

### 5.1 Riesgos prioritarios y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| La integración con el ERP vigente puede presentar restricciones no identificadas | Demoras en la validación de la API | Validar tempranamente el contrato mínimo de datos y los mecanismos autorizados de lectura y escritura |
| El destinatario no recibe el PIN por el canal de contacto disponible | La entrega no puede confirmarse mediante el flujo previsto | Utilizar las capacidades de reenvío y regeneración ya contempladas, consumidas por el panel administrativo |
| Intentos de adivinación del PIN | Confirmación fraudulenta de entregas | Aplicar límite de intentos, expiración temporal y registro de intentos fallidos |
| Ausencia de cobertura de red o de señal de ubicación durante la entrega | La evidencia no puede transmitirse en el momento o se completa con dos de los tres factores | Captura y validación local en el dispositivo, con sincronización diferida y revalidación al sincronizar |
| La verificación podría percibirse como un mecanismo de control sobre el conductor | Resistencia a la adopción | Presentar el sistema como respaldo del conductor frente a acusaciones infundadas, que es su efecto real |
| El PIN podría percibirse por el cliente como una fricción adicional | Deterioro de la experiencia que el sistema busca proteger | Comunicar el PIN como garantía de que solo el destinatario recibe su pedido y mantener el proceso en un único paso |
| La organización no dispone de una línea base de merma ni de reclamos por entrega | No es posible demostrar el beneficio obtenido | Establecer la línea base durante los primeros meses de operación, antes de comprometer metas de reducción |

### 5.2 Indicadores de éxito

El piloto debe establecer una línea base y metas para los siguientes indicadores.

**Medibles desde la puesta en marcha, a partir del registro del propio sistema:**

- Entregas confirmadas con los tres factores completos.
- Uso efectivo de la aplicación del conductor y del panel.

**Medibles incorporando el número de comprobante al registro de reclamos, ajuste que no modifica el alcance del sistema:**

- Reclamos por no recepción y proporción resuelta con evidencia.
- Tiempo de resolución de disputas por no recepción.

**Indicador de mediano plazo, obtenido del historial de ventas del ERP cruzado con los reclamos registrados:**

- Retención de clientes que atravesaron una entrega fallida.

Los valores objetivo se definirán una vez establecida la línea base durante los primeros meses de operación.

## 6. Conclusión

La plataforma permite demostrar que una entrega ocurrió y actuar sobre dos pérdidas vinculadas: la directa, en producto y operación, y la indirecta, en confianza, recurrencia y reputación. La API, la aplicación del conductor y el panel operan sobre un mismo registro de evidencia, sin sustituir el ERP ni los sistemas que soportan la operación.

El valor no se limita a reducir la pérdida. Al registrar cada entrega y cada incidencia, el sistema vuelve medible una merma que hoy no se distingue, lo que permitirá dimensionar el problema y evaluar el retorno con datos propios de la organización.

Verificar una entrega no solo protege la mercadería: permite resolver reclamos con justicia, cuidar la confianza del cliente y respaldar al conductor.

---

## Anexo B. Comparación frente a soluciones de prueba de entrega (POD)

> **Nota.** Este anexo se agrega después de la aprobación de la versión 1.1 del documento, sin modificar su contenido, en respuesta a la observación de que la diferenciación del apartado 5 ("firma o foto aislada") resultaba genérica frente a soluciones concretas del mercado. El resto del documento permanece como fue aprobado.

El apartado 5 diferencia la plataforma de un registro débil ("una firma o una fotografía aislada") o de sustituir el ERP. Para hacerla más concreta, se compara contra tres alternativas reales de prueba de entrega:

| Alternativa | Qué ofrece | Por qué no resuelve el problema de este piloto |
|---|---|---|
| **Onfleet** (plataforma de última milla con POD) | Foto, firma y GPS al confirmar; ruteo y notificaciones al cliente | Es una plataforma de ruteo completa, pensada para gestionar flotas de terceros y optimizar rutas; para una operación con flota propia y ERP existente, sustituye procesos que ya funcionan y exige migrar la asignación de rutas a su sistema. No valida contra el ERP vigente ni usa PIN de un solo uso dictado por el cliente. |
| **Bringg** (orquestación de entregas empresarial) | Foto, firma, geocerca y APIs de integración con ERP/WMS | Orientado a operaciones de gran escala con múltiples transportistas; requiere una integración de datos más profunda (contratos de API completos, no un contrato mínimo) y un costo de licenciamiento por encima de lo que justifica un piloto de una sola flota. |
| **Proceso manual de firma y foto** (lo que la mayoría de operaciones de reparto usan hoy) | Una firma en papel o una foto suelta enviada por WhatsApp | Es exactamente el "registro débil" que el apartado 5 describe: no ata la evidencia a una factura ni a una ubicación verificada, no impide que la firma o la foto se capturen fuera del lugar o momento de la entrega, y no deja un dato estructurado que se pueda auditar o medir. |

La plataforma se diferencia de las dos primeras por alcance (no reemplaza el ERP ni el ruteo, solo verifica la entrega) y costo (piloto de una sola flota, sin licenciamiento por transportista externo); y de la tercera por rigor (PIN de un solo uso, foto validada por el backend y ubicación GPS contrastada contra la dirección registrada, todo atado a la factura real).

