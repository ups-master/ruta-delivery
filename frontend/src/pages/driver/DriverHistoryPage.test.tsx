import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import apiClient from '../../api/client'
import { axiosErrorWithMessage, driverUser, mockDialog, ok, type LeafletMock } from '../../test/helpers'
import { Providers } from '../../test/Providers'
import type { DeliveryAttempt, PageResponse } from '../../types/domain'
import DriverHistoryPage from './DriverHistoryPage'

const leaflet = vi.hoisted(() => ({ current: null as unknown as LeafletMock }))
vi.mock('leaflet', async () => {
  const { createLeafletMock: create } = await import('../../test/helpers')
  leaflet.current = create()
  return { default: leaflet.current.L }
})
vi.mock('leaflet/dist/leaflet.css', () => ({}))
vi.mock('../../api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
const api = vi.mocked(apiClient, { deep: true })

const attempt = (over: Partial<DeliveryAttempt>): DeliveryAttempt => ({
  id: 1, invoiceId: 1, invoiceNumber: 'F-001', partnerName: 'Cliente Uno', deliveryAddress: 'Calle 1', driverName: 'Conductor Demo',
  outcome: 'CONFIRMED', latitude: -2.17, longitude: -79.92, detail: null, hasPhoto: true, distanceFromExpectedMeters: 120.4,
  createdAt: '2026-10-05T10:00:00Z', ...over,
})
const pageOf = (content: DeliveryAttempt[], totalPages = 1): PageResponse<DeliveryAttempt> => ({ content, page: 0, size: 20, totalElements: content.length, totalPages })

function renderPage() {
  return render(<Providers user={driverUser}><DriverHistoryPage /></Providers>)
}

describe('DriverHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDialog()
    URL.createObjectURL = vi.fn(() => 'blob:foto')
    URL.revokeObjectURL = vi.fn()
    api.get.mockImplementation((url: string) =>
      Promise.resolve(ok(url.endsWith('/photo') ? new Blob(['img']) : pageOf([attempt({}), attempt({ id: 2, invoiceNumber: 'F-002', outcome: 'INCIDENT', detail: 'Cliente ausente', hasPhoto: false, latitude: null, longitude: null, distanceFromExpectedMeters: null })]))) as never
    )
  })

  it('lista los intentos propios con su resultado', async () => {
    renderPage()
    expect(await screen.findByText('F-001')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/driver/deliveries/history', { params: { page: 0, size: 20 } })
    expect(screen.getByText('Entregado')).toHaveClass('success')
    expect(screen.getByText('Incidencia')).toHaveClass('warning')
  })

  it('muestra un mensaje cuando todavia no hay entregas', async () => {
    api.get.mockResolvedValue(ok(pageOf([])))
    renderPage()
    expect(await screen.findByText('Todavia no registraste entregas.')).toBeInTheDocument()
  })

  it('muestra el error si falla la carga', async () => {
    api.get.mockRejectedValue(axiosErrorWithMessage('Sesion expirada', 401))
    renderPage()
    expect(await screen.findByText('Sesion expirada')).toBeInTheDocument()
  })

  it('abre el detalle con los datos de la entrega y la distancia en metros', async () => {
    renderPage()
    await userEvent.click(await screen.findByText('F-001'))

    expect(await screen.findByRole('heading', { name: 'F-001' })).toBeInTheDocument()
    expect(screen.getByText('Cliente Uno')).toBeInTheDocument()
    expect(screen.getByText('Calle 1')).toBeInTheDocument()
    expect(screen.getByText('120 m')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/driver/deliveries/1/photo', { responseType: 'blob' })
  })

  it('formatea en kilometros las distancias de mas de 1 km y muestra el motivo de una incidencia', async () => {
    api.get.mockResolvedValue(ok(pageOf([attempt({ outcome: 'INCIDENT', detail: 'Direccion incorrecta', hasPhoto: false, distanceFromExpectedMeters: 2500 })])))
    renderPage()
    await userEvent.click(await screen.findByText('F-001'))

    expect(await screen.findByText('2.50 km')).toBeInTheDocument()
    expect(screen.getByText('Direccion incorrecta')).toBeInTheDocument()
  })

  it('la pestana Foto muestra la evidencia cargada o avisa si no hay', async () => {
    renderPage()
    await userEvent.click(await screen.findByText('F-001'))
    await userEvent.click(await screen.findByRole('button', { name: 'Foto' }))
    expect(await screen.findByAltText('Evidencia de entrega')).toHaveAttribute('src', 'blob:foto')

    await userEvent.click(screen.getAllByRole('button', { name: 'Cerrar' })[0])
    await userEvent.click(await screen.findByText('F-002'))
    await userEvent.click(await screen.findByRole('button', { name: 'Foto' }))
    expect(await screen.findByText('Sin foto de evidencia.')).toBeInTheDocument()
  })

  it('la pestana Mapa dibuja la ubicacion y la libera al cambiar de pestana', async () => {
    renderPage()
    await userEvent.click(await screen.findByText('F-001'))
    await userEvent.click(await screen.findByRole('button', { name: 'Mapa' }))

    await waitFor(() => expect(leaflet.current.L.map).toHaveBeenCalledTimes(1))
    expect(leaflet.current.map.setView).toHaveBeenCalledWith([-2.17, -79.92], 16)
    expect(leaflet.current.L.circleMarker).toHaveBeenCalledWith([-2.17, -79.92], expect.objectContaining({ radius: 9 }))

    await userEvent.click(screen.getByRole('button', { name: 'Datos' }))
    expect(leaflet.current.map.remove).toHaveBeenCalled()
  })

  it('sin ubicacion registrada no se dibuja el mapa', async () => {
    renderPage()
    await userEvent.click(await screen.findByText('F-002'))
    await userEvent.click(await screen.findByRole('button', { name: 'Mapa' }))
    expect(await screen.findByText('Sin ubicacion registrada.')).toBeInTheDocument()
    expect(leaflet.current.L.map).not.toHaveBeenCalled()
  })

  it('cerrar el detalle libera la URL de la foto', async () => {
    renderPage()
    await userEvent.click(await screen.findByText('F-001'))
    await screen.findByRole('heading', { name: 'F-001' })
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())

    await userEvent.click(screen.getAllByRole('button', { name: 'Cerrar' })[0])

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:foto')
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'F-001' })).not.toBeInTheDocument())
  })

  it('pagina el historial', async () => {
    api.get.mockResolvedValue(ok(pageOf([attempt({})], 2)))
    renderPage()
    await screen.findByText('Pagina 1 de 2')
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/driver/deliveries/history', { params: { page: 1, size: 20 } }))
  })
})
