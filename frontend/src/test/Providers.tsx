import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../context/authContextInstance'
import type { User } from '../types/domain'
import { driverUser } from './helpers'

/** Envuelve en Router + AuthContext con un usuario (o ninguno) y sus acciones simuladas. */
export function Providers({
  children,
  user = null,
  route = '/',
  auth,
}: {
  children: ReactNode
  user?: User | null
  route?: string
  auth?: Partial<AuthContextValue>
}) {
  const value: AuthContextValue = {
    user,
    login: async () => user ?? driverUser,
    logout: async () => {},
    ...auth,
  }
  return (
    <MemoryRouter initialEntries={[route]}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </MemoryRouter>
  )
}
