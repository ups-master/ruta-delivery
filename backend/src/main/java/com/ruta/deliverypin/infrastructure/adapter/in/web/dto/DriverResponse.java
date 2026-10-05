package com.ruta.deliverypin.infrastructure.adapter.in.web.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import com.ruta.deliverypin.domain.model.Driver;

public record DriverResponse(Long id, String username, String fullName, @Schema(allowableValues = {"ADMIN", "CONDUCTOR"}) String role, boolean active) {

    public static DriverResponse from(Driver driver) {
        return new DriverResponse(driver.getId(), driver.getUsername(), driver.getFullName(), driver.getRole().name(), driver.isActive());
    }
}
