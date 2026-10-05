package com.ruta.deliverypin.infrastructure.adapter.in.web.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import com.ruta.deliverypin.domain.port.in.LoginUseCase;

/**
 * Ya no incluye el JWT (auditoria tecnica, hallazgo P1): viaja solo en la cookie
 * HttpOnly que AuthController establece con Set-Cookie, nunca en el cuerpo de la
 * respuesta, para que el JavaScript del frontend no pueda leerlo (mitiga robo de
 * sesion por XSS).
 */
public record LoginResponse(String username, String fullName, @Schema(allowableValues = {"ADMIN", "CONDUCTOR"}) String role) {

    public static LoginResponse from(LoginUseCase.AuthResult result) {
        return new LoginResponse(result.username(), result.fullName(), result.role().name());
    }
}
