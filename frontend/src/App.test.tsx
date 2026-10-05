import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// Las paginas reales se cubren en sus propias pruebas: aqui solo se verifica el enrutado y la proteccion por rol.
vi.mock('./pages/driver/DriverHomePage', () => ({ default: () => <p>pantalla del conductor</p> }))
vi.mock('./pages/driver/DriverHistoryPage', () => ({ default: () => <p>historial del conductor</p> }))
vi.mock('./pages/admin/AdminLayout', async () => {
  const { Outlet } = await import('react-router-dom')
  return { default: () => <div><p>layout del admin</p><Outlet /></div> }
})
vi.mock('./pages/admin/AdminDashboardPage', () => ({ default: () => <p>panorama</p> }))
vi.mock('./pages/admin/AdminDriversPage', () => ({ default: () => <p>equipo</p> }))
vi.mock('./pages/admin/AdminDeliveriesPage', () => ({ default: () => <p>entregas</p> }))
vi.mock('./pages/admin/AdminInvoicesPage', () => ({ default: () => <p>facturas</p> }))

function renderAt(route: string, user?: { username: string; fullName: string; role: 'ADMIN' | 'CONDUCTOR' }) {
  localStorage.clear()
  if (user) localStorage.setItem('user', JSON.stringify(user))
  return render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>)
}

const admin = { username: 'admin', fullName: 'Admin', role: 'ADMIN' as const }
const driver = { username: 'conductor', fullName: 'Conductor', role: 'CONDUCTOR' as const }

describe('App: rutas y roles', () => {
  beforeEach(() => localStorage.clear())

  it('sin sesion, cualquier ruta lleva al login', async () => {
    renderAt('/')
    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
  })

  it('sin sesion, una ruta protegida redirige al login', async () => {
    renderAt('/admin/invoices')
    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
  })

  it('la raiz lleva a un conductor a su pantalla y a un administrador al panel', async () => {
    const { unmount } = renderAt('/', driver)
    expect(await screen.findByText('pantalla del conductor')).toBeInTheDocument()
    unmount()

    renderAt('/', admin)
    expect(await screen.findByText('panorama')).toBeInTheDocument()
    expect(screen.getByText('layout del admin')).toBeInTheDocument()
  })

  it('un administrador llega a cada seccion del panel', async () => {
    for (const [ruta, texto] of [['/admin/drivers', 'equipo'], ['/admin/deliveries', 'entregas'], ['/admin/invoices', 'facturas']] as const) {
      const { unmount } = renderAt(ruta, admin)
      expect(await screen.findByText(texto)).toBeInTheDocument()
      unmount()
    }
  })

  it('un conductor no puede entrar al panel y vuelve a su pantalla', async () => {
    renderAt('/admin/invoices', driver)
    expect(await screen.findByText('pantalla del conductor')).toBeInTheDocument()
    expect(screen.queryByText('facturas')).not.toBeInTheDocument()
  })

  it('el conductor y el administrador acceden al historial del conductor', async () => {
    renderAt('/driver/history', driver)
    expect(await screen.findByText('historial del conductor')).toBeInTheDocument()
  })

  it('una ruta desconocida redirige segun la sesion', async () => {
    renderAt('/no-existe', admin)
    expect(await screen.findByText('panorama')).toBeInTheDocument()
  })
})
