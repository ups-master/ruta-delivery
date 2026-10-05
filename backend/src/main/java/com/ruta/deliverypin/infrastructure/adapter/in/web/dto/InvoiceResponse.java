package com.ruta.deliverypin.infrastructure.adapter.in.web.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import com.ruta.deliverypin.domain.model.Invoice;

public record InvoiceResponse(
        Long id,
        String number,
        String partnerName,
        String deliveryAddress,
        String invoiceDate,
        @Schema(allowableValues = {"draft", "posted", "cancel"}) String state,
        Double expectedLatitude,
        Double expectedLongitude
) {
    public static InvoiceResponse from(Invoice invoice) {
        return new InvoiceResponse(
                invoice.id(),
                invoice.number(),
                invoice.partnerName(),
                invoice.deliveryAddress(),
                invoice.invoiceDate(),
                invoice.state(),
                invoice.expectedLatitude(),
                invoice.expectedLongitude()
        );
    }
}
