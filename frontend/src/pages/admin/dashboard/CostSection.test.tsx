import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import apiClient from '../../../api/client'
import { axiosErrorWithMessage, ok, statValue } from '../../../test/helpers'
import type { OperationalCost } from '../../../types/domain'
import { CostSection } from './CostSection'

vi.mock('../../../api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
const api = vi.mocked(apiClient, { deep: true })

const cost: OperationalCost = {
  month: '2026-10', confirmedDeliveries: 12, evidencePhotoBytes: 2048, evidenceStorageGb: 0.5, infrastructureCostUsd: 100,
  storageCostUsd: 10.5, supportHours: 8, supportCostUsd: 80, totalCostUsd: 190.5, costPerDeliveryUsd: 15.875,
}

describe('CostSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue(ok(cost))
  })

  it('muestra el costo del mes y su desglose', async () => {
    render(<CostSection />)
    expect(await screen.findByText('Entregas confirmadas')).toBeInTheDocument()

    expect(statValue('Entregas confirmadas')).toHaveTextContent('12')
    expect(statValue('Evidencia almacenada')).toHaveTextContent('0.50 GB')
    expect(statValue('Costo total del mes')).toHaveTextContent('USD 190.50')
    expect(statValue('Costo por entrega')).toHaveTextContent('USD 15.88')
    expect(screen.getByText('Infraestructura').nextSibling).toHaveTextContent('100.00')
    expect(screen.getByText('Soporte y mantenimiento').nextSibling).toHaveTextContent('80.00')
  })

  it('pide el mes actual y precarga las horas de soporte registradas', async () => {
    render(<CostSection />)
    await screen.findByText('Entregas confirmadas')

    const month = new Date().toISOString().slice(0, 7)
    expect(api.get).toHaveBeenCalledWith('/admin/cost', { params: { month } })
    expect(screen.getByLabelText(/Horas de soporte de/)).toHaveValue(8)
  })

  it('sin entregas el costo por entrega es "—"', async () => {
    api.get.mockResolvedValue(ok({ ...cost, confirmedDeliveries: 0, costPerDeliveryUsd: null }))
    render(<CostSection />)
    await screen.findByText('Entregas confirmadas')
    expect(statValue('Costo por entrega')).toHaveTextContent('—')
  })

  it('cambiar el mes vuelve a consultar ese mes', async () => {
    render(<CostSection />)
    await screen.findByText('Entregas confirmadas')

    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '2026-09' } })

    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/admin/cost', { params: { month: '2026-09' } }))
  })

  it('guarda las horas de soporte del mes y actualiza el reporte con la respuesta', async () => {
    api.put.mockResolvedValueOnce(ok({ ...cost, supportHours: 10, supportCostUsd: 100, totalCostUsd: 210.5 }))
    render(<CostSection />)
    await screen.findByText('Entregas confirmadas')

    const horas = screen.getByLabelText(/Horas de soporte de/)
    await userEvent.clear(horas)
    await userEvent.type(horas, '10')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar horas' }))

    const month = new Date().toISOString().slice(0, 7)
    expect(api.put).toHaveBeenCalledWith('/admin/cost/support-hours', { month, hours: 10 })
    await waitFor(() => expect(statValue('Costo total del mes')).toHaveTextContent('USD 210.50'))
  })

  it('muestra el error si no se pueden guardar las horas', async () => {
    api.put.mockRejectedValueOnce(axiosErrorWithMessage('Horas invalidas', 400))
    render(<CostSection />)
    await screen.findByText('Entregas confirmadas')

    await userEvent.click(screen.getByRole('button', { name: 'Guardar horas' }))

    expect(await screen.findByText('Horas invalidas')).toBeInTheDocument()
  })

  it('muestra el error si falla la carga del reporte', async () => {
    api.get.mockRejectedValue(axiosErrorWithMessage('Mes invalido', 400))
    render(<CostSection />)
    expect(await screen.findByText('Mes invalido')).toBeInTheDocument()
  })
})
