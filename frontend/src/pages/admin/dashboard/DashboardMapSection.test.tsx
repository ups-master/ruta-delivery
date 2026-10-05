import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import apiClient from '../../../api/client'
import { axiosErrorWithMessage, ok, statValue, type LeafletMock } from '../../../test/helpers'
import type { DeliveryAttempt, DriverMetric } from '../../../types/domain'
import { DashboardMapSection } from './DashboardMapSection'

const leaflet = vi.hoisted(() => ({ current: null as unknown as LeafletMock }))
vi.mock('leaflet', async () => {
  const { createLeafletMock: create } = await import('../../../test/helpers')
  leaflet.current = create()
  return { default: leaflet.current.L }
})
vi.mock('leaflet/dist/leaflet.css', () => ({}))
vi.mock('../../../api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
const api = vi.mocked(apiClient, { deep: true })

const point = (over: Partial<DeliveryAttempt>): DeliveryAttempt => ({
  id: 1, invoiceId: 1, invoiceNumber: 'F-001', partnerName: 'Cliente', deliveryAddress: 'Calle', driverName: 'Ana Conductora',
  outcome: 'CONFIRMED', latitude: -2.17, longitude: -79.92, detail: null, hasPhoto: true, distanceFromExpectedMeters: 50,
  createdAt: '2026-10-05T10:00:00Z', ...over,
})
const metrics: DriverMetric[] = [
  { driverName: 'Ana Conductora', confirmed: 3, rejected: 1, incident: 2, total: 6 },
  { driverName: 'Luis Conductor', confirmed: 4, rejected: 0, incident: 1, total: 5 },
]

function serve(points: DeliveryAttempt[], ms: DriverMetric[] = metrics) {
  api.get.mockImplementation((url: string) => Promise.resolve(ok(url === '/admin/dashboard/map' ? points : ms)) as never)
}

describe('DashboardMapSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serve([])
  })

  it('resume la actividad del equipo con totales y una fila por conductor', async () => {
    render(<DashboardMapSection />)
    expect(await screen.findByText('Ana Conductora')).toBeInTheDocument()

    expect(statValue('Entregas confirmadas')).toHaveTextContent('7')
    expect(statValue('Incidencias')).toHaveTextContent('3')
    expect(statValue('Intentos rechazados')).toHaveTextContent('1')
    expect(statValue('Conductores con actividad')).toHaveTextContent('2')
    expect(screen.getByText('Luis Conductor')).toBeInTheDocument()
  })

  it('indica cuando no hubo actividad en el rango', async () => {
    serve([], [])
    render(<DashboardMapSection />)
    expect(await screen.findByText('Sin actividad en este rango.')).toBeInTheDocument()
  })

  it('cambiar el rango vuelve a pedir los datos con un periodo de 7 dias', async () => {
    render(<DashboardMapSection />)
    await screen.findByText('Ana Conductora')

    await userEvent.click(screen.getByRole('button', { name: 'Ultimos 7 dias' }))

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(4)) // 2 llamadas por rango
    const { from, to } = api.get.mock.lastCall![1]!.params as { from: string; to: string }
    expect(Math.round((Date.parse(to) - Date.parse(from)) / 86400000)).toBe(7)
    expect(screen.getByRole('button', { name: 'Ultimos 7 dias' })).toHaveClass('active')
  })

  it('"Hoy" pide desde el inicio del dia', async () => {
    render(<DashboardMapSection />)
    await screen.findByText('Ana Conductora')
    const { from, to } = api.get.mock.calls[0][1]!.params as { from: string; to: string }
    expect(Date.parse(to) - Date.parse(from)).toBeLessThanOrEqual(86400000)
    expect(new Date(from).getHours()).toBe(0)
  })

  it('dibuja un marcador por entrega con ubicacion, con el color de su resultado, y omite las que no la tienen', async () => {
    serve([
      point({ id: 1, outcome: 'CONFIRMED' }),
      point({ id: 2, outcome: 'REJECTED' }),
      point({ id: 3, outcome: 'INCIDENT' }),
      point({ id: 4, outcome: 'OTRO' as DeliveryAttempt['outcome'] }),
      point({ id: 5, latitude: null, longitude: null }),
    ])
    render(<DashboardMapSection />)
    await screen.findByText('Ana Conductora')

    await waitFor(() => expect(leaflet.current.L.circleMarker).toHaveBeenCalledTimes(4))
    const colors = leaflet.current.L.circleMarker.mock.calls.map((c) => c[1].color)
    expect(colors).toEqual(['#3fbf7f', '#d7392b', '#f2a93b', '#888'])
    expect(leaflet.current.map.fitBounds).toHaveBeenCalled()
  })

  it('el popup se arma con texto plano: el detalle escrito por un conductor no puede inyectar HTML', async () => {
    serve([point({ outcome: 'INCIDENT', detail: '<img src=x onerror=alert(1)>' })])
    render(<DashboardMapSection />)
    await screen.findByText('Ana Conductora')

    await waitFor(() => expect(leaflet.current.marker.bindPopup).toHaveBeenCalled())
    const popup = leaflet.current.marker.bindPopup.mock.calls[0][0]
    expect(popup.querySelector('img')).toBeNull()
    expect(popup.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(popup.textContent).toContain('F-001')
    expect(popup.textContent).toContain('Ana Conductora')
    expect(popup.querySelector('strong')!.textContent).toBe('Incidencia')
  })

  it('sin ubicaciones no ajusta el zoom del mapa', async () => {
    serve([point({ latitude: null, longitude: null })])
    render(<DashboardMapSection />)
    await screen.findByText('Ana Conductora')
    expect(leaflet.current.map.fitBounds).not.toHaveBeenCalled()
  })

  it('muestra el error si falla la carga y limpia el mapa al desmontar', async () => {
    api.get.mockRejectedValue(axiosErrorWithMessage('Sesion expirada', 401))
    const { unmount } = render(<DashboardMapSection />)
    expect(await screen.findByText('Sesion expirada')).toBeInTheDocument()

    unmount()
    expect(leaflet.current.map.remove).toHaveBeenCalled()
  })
})
