package com.ruta.deliverypin.infrastructure.adapter.in.web;

import com.ruta.deliverypin.domain.exception.SelfAccountModificationException;
import com.ruta.deliverypin.domain.model.Driver;
import com.ruta.deliverypin.domain.model.PageRequest;
import com.ruta.deliverypin.domain.port.in.CreateDriverUseCase;
import com.ruta.deliverypin.domain.port.in.DeleteDriverUseCase;
import com.ruta.deliverypin.domain.port.in.ListDriversUseCase;
import com.ruta.deliverypin.domain.port.in.UpdateDriverUseCase;
import com.ruta.deliverypin.infrastructure.adapter.in.web.dto.CreateDriverRequest;
import com.ruta.deliverypin.infrastructure.adapter.in.web.dto.DriverResponse;
import com.ruta.deliverypin.infrastructure.adapter.in.web.dto.PageResponse;
import com.ruta.deliverypin.infrastructure.adapter.in.web.dto.UpdateDriverRequest;
import com.ruta.deliverypin.infrastructure.adapter.in.web.security.CurrentDriverResolver;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.util.UriComponentsBuilder;

@Tag(name = "Administración de usuarios", description = "Alta, baja y edición de administradores y conductores (app_user).")
@RestController
@RequestMapping("/api/v1/admin/users")
public class AdminDriverController {

    private final CreateDriverUseCase createDriverUseCase;
    private final UpdateDriverUseCase updateDriverUseCase;
    private final DeleteDriverUseCase deleteDriverUseCase;
    private final ListDriversUseCase listDriversUseCase;
    private final CurrentDriverResolver currentDriverResolver;

    public AdminDriverController(
            CreateDriverUseCase createDriverUseCase,
            UpdateDriverUseCase updateDriverUseCase,
            DeleteDriverUseCase deleteDriverUseCase,
            ListDriversUseCase listDriversUseCase,
            CurrentDriverResolver currentDriverResolver
    ) {
        this.createDriverUseCase = createDriverUseCase;
        this.updateDriverUseCase = updateDriverUseCase;
        this.deleteDriverUseCase = deleteDriverUseCase;
        this.listDriversUseCase = listDriversUseCase;
        this.currentDriverResolver = currentDriverResolver;
    }

    /** Un administrador no puede desactivarse ni eliminarse a si mismo (evita quedarse sin acceso por error). */
    private void rejectSelfModification(Long targetId) {
        if (currentDriverResolver.resolve().getId().equals(targetId)) {
            throw new SelfAccountModificationException();
        }
    }

    @Operation(summary = "Listar usuarios", description = "Administradores y conductores registrados, paginado (tamano maximo 100).")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Pagina de usuarios"),
            @ApiResponse(responseCode = "400", description = "'size' supera el maximo permitido")
    })
    @GetMapping
    public PageResponse<DriverResponse> list(
            // Default unificado a 20 (auditoria tecnica, hallazgo P1): antes este endpoint
            // era el unico de los listados paginados con default 100 en vez de 20
            // (AdminInvoiceController, DriverDeliveryController.history), una inconsistencia
            // de contrato sin justificacion de negocio. El maximo sigue en 100.
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") @Schema(type = "integer", format = "int32", defaultValue = "20", maximum = "100", description = "Tamano de pagina (maximo 100).") int size
    ) {
        var result = listDriversUseCase.listAll(new PageRequest(page, size));
        return PageResponse.from(result, DriverResponse::from);
    }

    @Operation(summary = "Crear un usuario", description = "Crea un administrador o conductor con contraseña ya hasheada (BCrypt).")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Usuario creado; el header Location apunta al recurso"),
            @ApiResponse(responseCode = "400", description = "Datos inválidos"),
            @ApiResponse(responseCode = "409", description = "Ya existe un usuario con ese username")
    })
    @PostMapping
    public ResponseEntity<DriverResponse> create(@Valid @RequestBody CreateDriverRequest request, UriComponentsBuilder uriBuilder) {
        Driver created = createDriverUseCase.create(new CreateDriverUseCase.CreateDriverCommand(
                request.username(), request.password(), request.fullName(), request.role()
        ));
        var location = uriBuilder.path("/api/v1/admin/users/{id}").buildAndExpand(created.getId()).toUri();
        return ResponseEntity.created(location).body(DriverResponse.from(created));
    }

    @Operation(summary = "Actualizar un usuario", description = "Reemplaza nombre, estado activo y opcionalmente la contraseña. Un administrador no puede "
            + "desactivarse a sí mismo.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Usuario actualizado"),
            @ApiResponse(responseCode = "400", description = "Datos inválidos"),
            @ApiResponse(responseCode = "404", description = "El usuario no existe"),
            @ApiResponse(responseCode = "409", description = "Un administrador intentó desactivarse a sí mismo")
    })
    @PutMapping("/{id}")
    public DriverResponse update(@PathVariable Long id, @Valid @RequestBody UpdateDriverRequest request) {
        if (Boolean.FALSE.equals(request.active())) {
            rejectSelfModification(id);
        }
        Driver updated = updateDriverUseCase.update(id, new UpdateDriverUseCase.UpdateDriverCommand(
                request.fullName(), request.active(), request.password()
        ));
        return DriverResponse.from(updated);
    }

    @Operation(summary = "Eliminar un usuario", description = "Un administrador no puede eliminarse a sí mismo. Falla con 409 si el usuario tiene "
            + "historial de entregas asociado (viola la FK de delivery_log.driver_id).")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Usuario eliminado"),
            @ApiResponse(responseCode = "404", description = "El usuario no existe"),
            @ApiResponse(responseCode = "409", description = "Autoeliminación, o el usuario tiene historial de entregas")
    })
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        rejectSelfModification(id);
        deleteDriverUseCase.delete(id);
        return ResponseEntity.noContent().build();
    }
}
