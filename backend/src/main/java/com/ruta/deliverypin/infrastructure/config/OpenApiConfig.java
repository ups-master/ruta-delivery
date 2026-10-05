package com.ruta.deliverypin.infrastructure.config;

import com.ruta.deliverypin.infrastructure.adapter.in.web.security.JwtAuthenticationFilter;
import com.ruta.deliverypin.infrastructure.adapter.in.web.dto.ErrorResponse;
import io.swagger.v3.core.converter.ModelConverters;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.servers.Server;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;
import java.util.Map;

/**
 * Documentacion OpenAPI generada a partir de los controladores y DTO ya existentes
 * (springdoc-openapi los lee via reflexion; no requiere anotar cada endpoint para
 * tener una documentacion base). Disponible en /v3/api-docs y /swagger-ui/index.html.
 */
@Configuration
public class OpenApiConfig {

    private static final String COOKIE_SCHEME = "sessionCookie";

    @Bean
    public OpenAPI rutaOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Ruta - API de verificacion de entregas")
                        .description("Verificacion de entregas con PIN, foto y ubicacion. "
                                + "Todas las rutas /api/v1/admin/** y /api/v1/driver/** exigen la cookie HttpOnly de sesion "
                                + "(\"" + JwtAuthenticationFilter.ACCESS_TOKEN_COOKIE + "\") que POST /api/v1/auth/login establece "
                                + "via Set-Cookie. Las peticiones que modifican datos requieren ademas el header X-XSRF-TOKEN "
                                + "(proteccion CSRF con doble cookie). Swagger UI envia la cookie solo si el login se hizo "
                                + "desde el propio navegador con \"Try it out\".")
                        .version("1.0.0"))
                .servers(List.of(new Server().url("/").description("Mismo origen que la aplicacion")))
                .addSecurityItem(new SecurityRequirement().addList(COOKIE_SCHEME))
                .components(new Components().addSecuritySchemes(COOKIE_SCHEME,
                        new SecurityScheme()
                                .name(JwtAuthenticationFilter.ACCESS_TOKEN_COOKIE)
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.COOKIE)));
    }

    /**
     * Toda respuesta 4xx/5xx de la API usa la misma forma (ErrorResponse, producida por
     * GlobalExceptionHandler): se declara una sola vez aqui para que el contrato la
     * publique en cada operacion sin anotar uno por uno los controladores.
     */
    @Bean
    public OpenApiCustomizer errorResponseCustomizer() {
        return openApi -> {
            Map<String, Schema> resolved = ModelConverters.getInstance().readAll(ErrorResponse.class);
            resolved.forEach((name, schema) -> openApi.getComponents().addSchemas(name, schema));
            Schema<?> ref = new Schema<>().$ref("#/components/schemas/ErrorResponse");
            openApi.getPaths().values().forEach(path -> path.readOperations().forEach(op -> {
                if (op.getResponses() == null) {
                    return;
                }
                op.getResponses().forEach((code, response) -> {
                    if (code.length() == 3 && (code.charAt(0) == '4' || code.charAt(0) == '5')) {
                        response.setContent(new Content().addMediaType(
                                org.springframework.http.MediaType.APPLICATION_JSON_VALUE, new MediaType().schema(ref)));
                    }
                });
            }));
        };
    }
}
