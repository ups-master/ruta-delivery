import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import apiClient from '../api/client'
import { ok } from '../test/helpers'
import { AuthProvider } from './AuthContext'
import { useAuth } from './useAuth'

vi.mock('../api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
const api = vi.mocked(apiClient, { deep: true })

function Probe() {
  const { user, login, logout } = useAuth()
  return (
    <div>
      <p data-testid="user">{user ? `${user.username}:${user.role}` : 'anonimo'}</p>
      <button onClick={() => login('conductor', 'secreta', true)}>entrar recordando</button>
      <button onClick={() => login('conductor', 'secreta', false)}>entrar sin recordar</button>
      <button onClick={() => logout()}>salir</button>
    </div>
  )
}

const response = { username: 'conductor', fullName: 'Conductor Demo', role: 'CONDUCTOR' as const, token: 'no-debe-guardarse' }

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('arranca sin usuario si no hay nada guardado', () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    expect(screen.getByTestId('user')).toHaveTextContent('anonimo')
  })

  it('recupera el usuario guardado en localStorage o en sessionStorage', () => {
    localStorage.setItem('user', JSON.stringify({ username: 'ana', fullName: 'Ana', role: 'ADMIN' }))
    const { unmount } = render(<AuthProvider><Probe /></AuthProvider>)
    expect(screen.getByTestId('user')).toHaveTextContent('ana:ADMIN')
    unmount()

    localStorage.clear()
    sessionStorage.setItem('user', JSON.stringify({ username: 'luis', fullName: 'Luis', role: 'CONDUCTOR' }))
    render(<AuthProvider><Probe /></AuthProvider>)
    expect(screen.getByTestId('user')).toHaveTextContent('luis:CONDUCTOR')
  })

  it('login con "mantener sesion" guarda solo el perfil en localStorage (nunca el token)', async () => {
    api.post.mockResolvedValueOnce(ok(response))
    render(<AuthProvider><Probe /></AuthProvider>)

    await userEvent.click(screen.getByText('entrar recordando'))

    expect(api.post).toHaveBeenCalledWith('/auth/login', { username: 'conductor', password: 'secreta', remember: true })
    expect(screen.getByTestId('user')).toHaveTextContent('conductor:CONDUCTOR')
    const stored = JSON.parse(localStorage.getItem('user') ?? '{}')
    expect(stored).toEqual({ username: 'conductor', fullName: 'Conductor Demo', role: 'CONDUCTOR' })
    expect(sessionStorage.getItem('user')).toBeNull()
  })

  it('login sin "mantener sesion" usa sessionStorage', async () => {
    api.post.mockResolvedValueOnce(ok(response))
    render(<AuthProvider><Probe /></AuthProvider>)

    await userEvent.click(screen.getByText('entrar sin recordar'))

    expect(sessionStorage.getItem('user')).not.toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
  })

  it('logout llama al backend y limpia el estado local', async () => {
    localStorage.setItem('user', JSON.stringify({ username: 'ana', fullName: 'Ana', role: 'ADMIN' }))
    api.post.mockResolvedValueOnce(ok(null))
    render(<AuthProvider><Probe /></AuthProvider>)

    await userEvent.click(screen.getByText('salir'))

    expect(api.post).toHaveBeenCalledWith('/auth/logout')
    expect(screen.getByTestId('user')).toHaveTextContent('anonimo')
    expect(localStorage.getItem('user')).toBeNull()
  })

  it('logout limpia el estado local aunque falle la llamada al backend', async () => {
    sessionStorage.setItem('user', JSON.stringify({ username: 'luis', fullName: 'Luis', role: 'CONDUCTOR' }))
    api.post.mockRejectedValueOnce(new Error('red caida'))
    render(<AuthProvider><Probe /></AuthProvider>)

    await act(async () => { await userEvent.click(screen.getByText('salir')) })

    expect(screen.getByTestId('user')).toHaveTextContent('anonimo')
    expect(sessionStorage.getItem('user')).toBeNull()
  })
})

describe('useAuth', () => {
  it('falla con un mensaje claro si se usa fuera de AuthProvider', () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useAuth())).toThrow('useAuth debe usarse dentro de AuthProvider')
    silence.mockRestore()
  })
})
