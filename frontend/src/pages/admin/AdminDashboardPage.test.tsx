import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AdminDashboardPage from './AdminDashboardPage'

vi.mock('./dashboard/DashboardMapSection', () => ({ DashboardMapSection: () => <p>seccion del mapa</p> }))
vi.mock('./dashboard/CostSection', () => ({ CostSection: () => <p>seccion de costo</p> }))
vi.mock('./dashboard/ResilienceSection', () => ({ ResilienceSection: () => <p>seccion de resiliencia</p> }))

describe('AdminDashboardPage', () => {
  it('compone el mapa, el costo y la resiliencia bajo un mismo titulo', () => {
    render(<AdminDashboardPage />)
    expect(screen.getByRole('heading', { name: 'Todo en perspectiva.' })).toBeInTheDocument()
    expect(screen.getByText('seccion del mapa')).toBeInTheDocument()
    expect(screen.getByText('seccion de costo')).toBeInTheDocument()
    expect(screen.getByText('seccion de resiliencia')).toBeInTheDocument()
  })
})
