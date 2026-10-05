package com.ruta.deliverypin.infrastructure.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.skyscreamer.jsonassert.JSONAssert;
import org.skyscreamer.jsonassert.JSONCompareMode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Conformidad contrato-implementacion: {@code docs/openapi.json} es la fuente de verdad de
 * la API (contract-first) y este test falla si lo que el backend publica en
 * {@code /v3/api-docs} difiere de el, en cualquier direccion (ruta, campo, codigo de
 * respuesta o enum de mas o de menos).
 *
 * <p>Para cambiar la API: editar primero {@code docs/openapi.json}, revisarlo en el PR e
 * implementar hasta que este test pase. Si el cambio ya esta implementado y solo hay que
 * actualizar el archivo, el JSON real queda en {@code target/openapi-actual.json}.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class OpenApiContractIntegrationTest {

    private static final Path CONTRACT = Path.of("..", "docs", "openapi.json");
    private static final Path ACTUAL = Path.of("target", "openapi-actual.json");

    @Container
    static PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void datasourceProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("app.jwt.secret", () -> "test_secret_for_testcontainers_integration_min_32_chars_long");
        registry.add("app.admin.bootstrap-password", () -> "testcontainers_admin_password");
    }

    @Autowired
    private TestRestTemplate rest;

    @Test
    void implementationMatchesTheVersionedContract() throws Exception {
        String actual = rest.getForObject("/v3/api-docs", String.class);
        assertThat(actual).as("/v3/api-docs debe responder sin autenticacion").isNotBlank();

        ObjectMapper mapper = new ObjectMapper();
        JsonNode actualTree = mapper.readTree(actual);
        Files.createDirectories(ACTUAL.getParent());
        Files.writeString(ACTUAL, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(actualTree) + "\n");

        assertThat(CONTRACT).as("falta docs/openapi.json (el test corre desde backend/)").exists();
        String expected = Files.readString(CONTRACT);

        try {
            JSONAssert.assertEquals(expected, actual, JSONCompareMode.NON_EXTENSIBLE);
        } catch (AssertionError e) {
            throw new AssertionError("La implementacion no coincide con docs/openapi.json. "
                    + "Si el contrato es el correcto, corrige el codigo; si el cambio de API es intencional, "
                    + "actualiza primero docs/openapi.json (JSON real en backend/target/openapi-actual.json).\n"
                    + e.getMessage(), e);
        }
    }
}
