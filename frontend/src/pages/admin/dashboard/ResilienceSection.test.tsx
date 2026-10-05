import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import apiClient from '../../../api/client'
import { axiosErrorWithMessage, ok, statValue } from '../../../test/helpers'
import type { CircuitBreakerStatus } from '../../../types/domain'
import { ResilienceSection } from './ResilienceSection'

vi.mock('../../../api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
const api = vi.mocked(apiClient, { deep: true })

const closed: CircuitBreakerStatus = {
  state: 'CLOSED', enabled: true, pendingSimulatedFailures: 0, failureRate: 0, numberOfSuccessfulCalls: 10, numberOfFailedCalls: 0,
  numberOfNotPermittedCalls: 0, retryEnabled: true, retrySuccessfulCallsWithoutRetry: 146280, retrySuccessfulCallsWithRetry: 2, retryFailedCallsWithRetry: 1,
}

describe('ResilienceSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue(ok(closed))
  })

  it('muestra el estado del breaker y las estadisticas de Retry', async () => {
    render(<ResilienceSection />)
    expect(await screen.findByText('Estado del breaker')).toBeInTheDocument()

    expect(api.get).toHaveBeenCalledWith('/admin/resilience/status')
    expect(statValue('Tasa de fallo')).toHaveTextContent('0%')
    expect(statValue('Éxitos sin reintentar')).toHaveTextContent('146280')
    expect(statValue('Éxitos tras reintentar')).toHaveTextContent('2')
    expect(statValue('Fallos incluso reintentando')).toHaveTextContent('1')
    expect(screen.getAllByText('Sí')).toHaveLength(2) // breaker y retry activados
  })

  it('muestra "No" cuando el breaker o el retry estan desactivados y "—" sin tasa de fallo', async () => {
    api.get.mockResolvedValue(ok({ ...closed, enabled: false, retryEnabled: false, failureRate: -1 }))
    render(<ResilienceSection />)
    await screen.findByText('Estado del breaker')
    expect(screen.getAllByText('No')).toHaveLength(2)
    expect(statValue('Tasa de fallo')).toHaveTextContent('—')
  })

  it.each([['OPEN'], ['HALF_OPEN']] as const)('refleja el estado %s', async (state) => {
    api.get.mockResolvedValue(ok({ ...closed, state, failureRate: 50 }))
    render(<ResilienceSection />)
    await screen.findByText('Estado del breaker')
    expect(statValue('Estado del breaker')).toHaveTextContent(state)
    expect(statValue('Tasa de fallo')).toHaveTextContent('50%')
  })

  it('"Simular 6 fallos" los programa y muestra el estado devuelto', async () => {
    api.post.mockResolvedValueOnce(ok({ ...closed, pendingSimulatedFailures: 6 }))
    render(<ResilienceSection />)
    await screen.findByText('Estado del breaker')

    await userEvent.click(screen.getByRole('button', { name: /Simular 6 fallos/ }))

    expect(api.post).toHaveBeenCalledWith('/admin/resilience/simulate-failures', { count: 6 })
    await waitFor(() => expect(statValue('Fallos simulados pendientes')).toHaveTextContent('6'))
  })

  it('"Simular 2 fallos" envia count=2', async () => {
    api.post.mockResolvedValueOnce(ok(closed))
    render(<ResilienceSection />)
    await screen.findByText('Estado del breaker')
    await userEvent.click(screen.getByRole('button', { name: /Simular 2 fallos/ }))
    expect(api.post).toHaveBeenCalledWith('/admin/resilience/simulate-failures', { count: 2 })
  })

  it('muestra el error si no se pueden simular los fallos', async () => {
    api.post.mockRejectedValueOnce(axiosErrorWithMessage('Breaker desactivado', 409))
    render(<ResilienceSection />)
    await screen.findByText('Estado del breaker')

    await userEvent.click(screen.getByRole('button', { name: /Simular 6 fallos/ }))

    expect(await screen.findByText('Breaker desactivado')).toBeInTheDocument()
  })

  it('"Actualizar estado" vuelve a consultar', async () => {
    render(<ResilienceSection />)
    await screen.findByText('Estado del breaker')
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
  })

  it('muestra el error si falla la consulta inicial', async () => {
    api.get.mockRejectedValue(axiosErrorWithMessage('Sin permiso', 403))
    render(<ResilienceSection />)
    expect(await screen.findByText('Sin permiso')).toBeInTheDocument()
  })
})
