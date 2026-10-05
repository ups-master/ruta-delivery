package com.ruta.deliverypin.infrastructure.adapter.in.web;

import com.ruta.deliverypin.domain.model.PageRequest;
import com.ruta.deliverypin.domain.model.StoredPhoto;
import com.ruta.deliverypin.domain.port.in.GetDeliveryPhotoUseCase;
import com.ruta.deliverypin.domain.port.in.ListDeliveryHistoryUseCase;
import com.ruta.deliverypin.infrastructure.adapter.in.web.dto.DeliveryAttemptResponse;
import com.ruta.deliverypin.infrastructure.adapter.in.web.dto.PageResponse;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Historial de entregas (admin)", description = "Historial paginado de entregas/incidencias de todos los conductores, y su foto de evidencia.")
@RestController
@RequestMapping("/api/v1/admin/deliveries")
public class AdminDeliveryHistoryController {

    private final ListDeliveryHistoryUseCase listDeliveryHistoryUseCase;
    private final GetDeliveryPhotoUseCase getDeliveryPhotoUseCase;

    public AdminDeliveryHistoryController(
            ListDeliveryHistoryUseCase listDeliveryHistoryUseCase,
            GetDeliveryPhotoUseCase getDeliveryPhotoUseCase
    ) {
        this.listDeliveryHistoryUseCase = listDeliveryHistoryUseCase;
        this.getDeliveryPhotoUseCase = getDeliveryPhotoUseCase;
    }

    @Operation(summary = "Historial de entregas", description = "Entregas e incidencias de todos los conductores, paginado (tamano maximo 100).")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Pagina del historial"),
            @ApiResponse(responseCode = "400", description = "'size' supera el maximo permitido")
    })
    @GetMapping
    public PageResponse<DeliveryAttemptResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") @Schema(type = "integer", format = "int32", defaultValue = "20", maximum = "100", description = "Tamano de pagina (maximo 100).") int size
    ) {
        var result = listDeliveryHistoryUseCase.list(new PageRequest(page, size));
        return PageResponse.from(result, DeliveryAttemptResponse::from);
    }

    @Operation(summary = "Foto de una entrega", description = "Devuelve la foto de evidencia asociada al intento de entrega indicado.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Imagen de la evidencia (JPEG o PNG)"),
            @ApiResponse(responseCode = "404", description = "No existe evidencia para ese intento")
    })
    @GetMapping("/{id}/photo")
    public ResponseEntity<byte[]> photo(@PathVariable Long id) {
        return getDeliveryPhotoUseCase.getPhoto(id)
                .map(this::toImageResponse)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    private ResponseEntity<byte[]> toImageResponse(StoredPhoto photo) {
        MediaType mediaType = photo.contentType() != null
                ? MediaType.parseMediaType(photo.contentType())
                : MediaType.IMAGE_JPEG;
        return ResponseEntity.ok().contentType(mediaType).body(photo.data());
    }
}
