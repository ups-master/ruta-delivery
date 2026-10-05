package com.ruta.deliverypin.infrastructure.adapter.in.web.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import com.ruta.deliverypin.domain.model.AdminInvoiceView;

public record AdminInvoiceResponse(
        Long id,
        String number,
        String partnerName,
        String deliveryAddress,
        String invoiceDate,
        @Schema(allowableValues = {"draft", "posted", "cancel"}) String state,
        boolean requiresPin,
        String pin,
        boolean confirmed,
        Double expectedLatitude,
        Double expectedLongitude,
        String createdBy,
        String publishedBy
) {
    public static AdminInvoiceResponse from(AdminInvoiceView view) {
        return new AdminInvoiceResponse(
                view.id(), view.number(), view.partnerName(), view.deliveryAddress(), view.invoiceDate(),
                view.state(), view.requiresPin(), view.pin(), view.confirmed(), view.expectedLatitude(), view.expectedLongitude(),
                view.createdBy(), view.publishedBy()
        );
    }
}
