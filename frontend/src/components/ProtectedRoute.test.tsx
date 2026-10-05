import { render, screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { adminUser, driverUser } from '../test/helpers'
import { Providers } from '../test/Providers'
import type { Role, User } from '../types/domain'
import ProtectedRoute from './ProtectedRoute'

function renderRoute(user: User | null, roles?: Role[]) {
  return render(
    <Providers user={user} route="/secreto">
      <Routes>
        <Route path="/login" element={<p>pantalla de login</p>} />
        <Route path="/admin" element={<p>inicio del admin</p>} />
        <Route path="/" element={<p>inicio</p>} />
        <Route path="/secreto" element={<ProtectedRoute roles={roles}><p>contenido protegido</p></ProtectedRoute>} />
      </Routes>
    </Providers>
  )
}

describe('ProtectedRoute', () => {
  it('redirige al login si no hay sesion', () => {
    renderRoute(null, ['ADMIN'])
    expect(screen.getByText('pantalla de login')).toBeInTheDocument()
  })

  it('deja pasar a un rol permitido', () => {
    renderRoute(adminUser, ['ADMIN'])
    expect(screen.getByText('contenido protegido')).toBeInTheDocument()
  })

  it('deja pasar a cualquier usuario autenticado si no se piden roles', () => {
    renderRoute(driverUser)
    expect(screen.getByText('contenido protegido')).toBeInTheDocument()
  })

  it('un conductor que intenta entrar a una ruta de admin vuelve al inicio', () => {
    renderRoute(driverUser, ['ADMIN'])
    expect(screen.getByText('inicio')).toBeInTheDocument()
    expect(screen.queryByText('contenido protegido')).not.toBeInTheDocument()
  })

  it('un admin en una ruta que no le corresponde va al panel de administracion', () => {
    renderRoute(adminUser, ['CONDUCTOR'])
    expect(screen.getByText('inicio del admin')).toBeInTheDocument()
  })
})
