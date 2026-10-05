import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { adminUser } from '../../test/helpers'
import { Providers } from '../../test/Providers'
import AdminLayout from './AdminLayout'

function setup(logout = vi.fn().mockResolvedValue(undefined)) {
  render(
    <Providers user={adminUser} route="/admin/dashboard" auth={{ logout }}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="dashboard" element={<p>contenido del panel</p>} />
        </Route>
      </Routes>
    </Providers>
  )
  return { logout }
}

describe('AdminLayout', () => {
  it('muestra la barra con el administrador, la navegacion y el contenido de la ruta', () => {
    setup()
    expect(screen.getByText('Administrador Demo')).toBeInTheDocument()
    expect(screen.getByText('contenido del panel')).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Administración' })
    expect(nav).toHaveTextContent('Panorama')
    expect(screen.getByRole('link', { name: /Facturas/ })).toHaveAttribute('href', '/admin/invoices')
    expect(screen.getByRole('link', { name: /Equipo/ })).toHaveAttribute('href', '/admin/drivers')
    expect(screen.getByRole('link', { name: /Entregas/ })).toHaveAttribute('href', '/admin/deliveries')
    expect(screen.getByRole('link', { name: /Vista de conductor/ })).toHaveAttribute('href', '/driver')
  })

  it('cerrar sesion llama a logout', async () => {
    const { logout } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(logout).toHaveBeenCalledTimes(1)
  })
})
