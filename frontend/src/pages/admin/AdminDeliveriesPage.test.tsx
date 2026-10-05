import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import apiClient from '../../api/client'
import { axiosErrorWithMessage, mockDialog, ok } from '../../test/helpers'
import type { DeliveryAttempt, PageResponse } from '../../types/domain'
import AdminDeliveriesPage from './AdminDeliveriesPage'

vi.mock('../../api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
const api = vi.mocked(apiClient, { deep: true })

const attempt = (over: Partial<DeliveryAttempt>): DeliveryAttempt => ({
  id: 1, invoiceId: 1, invoiceNumber: 'F-001', partnerName: 'Cliente', deliveryAddress: 'Calle', driverName: 'Conductor Demo',
  outcome: 'CONFIRMED', latitude: -2.17, longitude: -79.92, detail: null, hasPhoto: true, distanceFromExpectedMeters: 120,
  createdAt: '2026-10-05T10:00:00Z', ...over,
})
const rows = [
  attempt({ id: 1 }),
  attempt({ id: 2, invoiceNumber: 'F-002', outcome: 'REJECTED', detail: 'El PIN ingresado no es correcto.', hasPhoto: false, latitude: null, longitude: null, distanceFromExpectedMeters: null }),
  attempt({ id: 3, invoiceNumber: 'F-003', outcome: 'INCIDENT', detail: 'Cliente ausente', distanceFromExpectedMeters: 5400 }),
]
const pageOf = (content: DeliveryAttempt[], totalPages = 1): PageResponse<DeliveryAttempt> => ({ content, page: 0, size: 20, totalElements: content.length, totalPages })

describe('AdminDeliveriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDialog()
    URL.createObjectURL = vi.fn(() => 'blob:foto')
    URL.revokeObjectURL = vi.fn()
    api.get.mockResolvedValue(ok(pageOf(rows)))
  })

  it('muestra cada intento con su resultado, detalle y ubicacion', async () => {
    render(<AdminDeliveriesPage />)
    expect(await screen.findByText('F-001')).toBeInTheDocument()

    expect(screen.getByText('Entregado')).toHaveClass('success')
    expect(screen.getByText('Rechazado')).toHaveClass('error')
    expect(screen.getByText('Incidencia')).toHaveClass('warning')
    expect(screen.getByText('El PIN ingresado no es correcto.')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '-2.17000, -79.92000' })[0]).toHaveAttribute('href', 'https://www.google.com/maps?q=-2.17,-79.92')
  })

  it('advierte cuando la entrega quedo a mas de 2 km de la direccion registrada', async () => {
    render(<AdminDeliveriesPage />)
    await screen.findByText('F-001')
    expect(screen.getByText(/5\.4 km de la direccion registrada/)).toBeInTheDocument()
    expect(screen.getAllByText(/km de la direccion registrada/)).toHaveLength(1) // los 120 m no advierten
  })

  it('un resultado desconocido se muestra tal cual', async () => {
    api.get.mockResolvedValue(ok(pageOf([attempt({ id: 9, outcome: 'OTRO' as DeliveryAttempt['outcome'] })])))
    render(<AdminDeliveriesPage />)
    expect(await screen.findByText('OTRO')).toHaveClass('error')
  })

  it('abre la foto de evidencia en un modal y la libera al cerrar', async () => {
    api.get.mockResolvedValueOnce(ok(pageOf(rows))).mockResolvedValueOnce(ok(new Blob(['img'])))
    render(<AdminDeliveriesPage />)
    await screen.findByText('F-001')

    await userEvent.click(screen.getAllByRole('button', { name: 'Ver foto' })[0])

    expect(api.get).toHaveBeenLastCalledWith('/admin/deliveries/1/photo', { responseType: 'blob' })
    expect(await screen.findByAltText('Evidencia de entrega')).toHaveAttribute('src', 'blob:foto')

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:foto')
    await waitFor(() => expect(screen.queryByAltText('Evidencia de entrega')).not.toBeInTheDocument())
  })

  it('muestra el error si no se puede cargar la foto', async () => {
    api.get.mockResolvedValueOnce(ok(pageOf(rows))).mockRejectedValueOnce(axiosErrorWithMessage('Foto no encontrada', 404))
    render(<AdminDeliveriesPage />)
    await screen.findByText('F-001')

    await userEvent.click(screen.getAllByRole('button', { name: 'Ver foto' })[0])

    expect(await screen.findByText('Foto no encontrada')).toBeInTheDocument()
  })

  it('muestra el error si falla la carga del historial', async () => {
    api.get.mockRejectedValue(axiosErrorWithMessage('Sesion expirada', 401))
    render(<AdminDeliveriesPage />)
    expect(await screen.findByText('Sesion expirada')).toBeInTheDocument()
  })

  it('pagina el historial', async () => {
    api.get.mockResolvedValue(ok(pageOf(rows, 2)))
    render(<AdminDeliveriesPage />)
    await screen.findAllByText(/Pagina 1 de 2/)
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/admin/deliveries', { params: { page: 1, size: 20 } }))
  })
})
