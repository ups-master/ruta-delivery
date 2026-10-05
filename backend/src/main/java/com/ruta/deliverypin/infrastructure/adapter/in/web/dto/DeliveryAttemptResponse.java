package com.ruta.deliverypin.infrastructure.adapter.in.web.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import com.ruta.deliverypin.domain.model.DeliveryAttemptSummary;

import java.time.Instant;

public record DeliveryAttemptResponse(
        Long id,
        Long invoiceId,
        String invoiceNumber,
        String partnerName,
        String deliveryAddress,
        String driverName,
        @Schema(allowableValues = {"CONFIRMED", "REJECTED", "INCIDENT"}) String outcome,
        Double latitude,
        Double longitude,
        String detail,
        boolean hasPhoto,
        Double distanceFromExpectedMeters,
        Instant createdAt
) {
    public static DeliveryAttemptResponse from(DeliveryAttemptSummary attempt) {
        return new DeliveryAttemptResponse(
                attempt.id(),
                attempt.invoiceId(),
                attempt.invoiceNumber(),
                attempt.partnerName(),
                attempt.deliveryAddress(),
                attempt.driverName(),
                attempt.outcome().name(),
                attempt.latitude(),
                attempt.longitude(),
                attempt.detail(),
                attempt.hasPhoto(),
                attempt.distanceFromExpectedMeters(),
                attempt.createdAt()
        );
    }
}
