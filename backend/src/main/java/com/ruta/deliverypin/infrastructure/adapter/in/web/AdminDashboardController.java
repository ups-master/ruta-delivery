package com.ruta.deliverypin.infrastructure.adapter.in.web;

import com.ruta.deliverypin.domain.port.in.GetDriverMetricsUseCase;
import com.ruta.deliverypin.domain.port.in.ListDeliveryAttemptsInRangeUseCase;
import com.ruta.deliverypin.infrastructure.adapter.in.web.dto.DeliveryAttemptResponse;
import com.ruta.deliverypin.infrastructure.adapter.in.web.dto.DriverMetricResponse;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Datos agregados para el tablero del admin: mapa de entregas/incidencias
 * y metricas por conductor, ambos acotados a un rango de fechas.
 */
@Tag(name = "Tablero administrativo", description = "Mapa de entregas/incidencias y métricas por conductor, ambos acotados a un rango de fechas.")
@RestController
@RequestMapping("/api/v1/admin/dashboard")
public class AdminDashboardController {

    /** Rango maximo permitido (Fase8): evita una consulta arbitrariamente pesada sobre delivery_log. */
    private static final Duration MAX_RANGE = Duration.ofDays(93);

    private final ListDeliveryAttemptsInRangeUseCase listDeliveryAttemptsInRangeUseCase;
    private final GetDriverMetricsUseCase getDriverMetricsUseCase;

    public AdminDashboardController(
            ListDeliveryAttemptsInRangeUseCase listDeliveryAttemptsInRangeUseCase,
            GetDriverMetricsUseCase getDriverMetricsUseCase
    ) {
        this.listDeliveryAttemptsInRangeUseCase = listDeliveryAttemptsInRangeUseCase;
        this.getDriverMetricsUseCase = getDriverMetricsUseCase;
    }

    private static void validateRange(Instant from, Instant to) {
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("El parametro 'to' no puede ser anterior a 'from'.");
        }
        if (Duration.between(from, to).compareTo(MAX_RANGE) > 0) {
            throw new IllegalArgumentException("El rango entre 'from' y 'to' no puede superar " + MAX_RANGE.toDays() + " dias.");
        }
    }

    @Operation(summary = "Mapa de entregas e incidencias", description = "Puntos con ubicacion (latitud/longitud) dentro del rango de fechas dado, para pintar en el mapa del panel.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Puntos del mapa en el rango solicitado"),
            @ApiResponse(responseCode = "400", description = "'to' anterior a 'from', o el rango supera los 93 dias")
    })
    @GetMapping("/map")
    public List<DeliveryAttemptResponse> map(
            @Parameter(description = "Inicio del rango (ISO-8601). El rango entre from y to no puede superar 93 dias.") @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @Parameter(description = "Fin del rango (ISO-8601). No puede ser anterior a from.") @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to
    ) {
        validateRange(from, to);
        return listDeliveryAttemptsInRangeUseCase.list(from, to).stream()
                .filter(attempt -> attempt.latitude() != null && attempt.longitude() != null)
                .map(DeliveryAttemptResponse::from)
                .toList();
    }

    @Operation(summary = "Metricas por conductor", description = "Entregas confirmadas, incidencias y otros conteos agregados por conductor, dentro del rango de fechas dado.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Metricas por conductor en el rango solicitado"),
            @ApiResponse(responseCode = "400", description = "'to' anterior a 'from', o el rango supera los 93 dias")
    })
    @GetMapping("/metrics")
    public List<DriverMetricResponse> metrics(
            @Parameter(description = "Inicio del rango (ISO-8601). El rango entre from y to no puede superar 93 dias.") @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @Parameter(description = "Fin del rango (ISO-8601). No puede ser anterior a from.") @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to
    ) {
        validateRange(from, to);
        return getDriverMetricsUseCase.metrics(from, to).stream().map(DriverMetricResponse::from).toList();
    }
}
