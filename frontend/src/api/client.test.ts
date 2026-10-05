import { beforeEach, describe, expect, it } from 'vitest'
import type { AxiosError } from 'axios'
import apiClient from './client'

// axios expone los interceptores registrados en .interceptors.<tipo>.handlers[i], pero
// ese array no forma parte de los tipos publicos (@types de axios); se define aqui una
// interfaz minima solo para el shape que se necesita, y se castea puntualmente.
interface InterceptorHandlers<V> {
  handlers: Array<{
    fulfilled: (value: V) => V | Promise<V>
    rejected: (error: AxiosError) => unknown
  } | null>
}

function responseRejected(error: AxiosError): unknown {
  const handlers = (apiClient.interceptors.response as unknown as InterceptorHandlers<unknown>).handlers
  return handlers[0]!.rejected(error)
}

function setLocation(pathname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname, href: '' },
  })
}

describe('apiClient', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setLocation('/admin/dashboard')
  })

  // El JWT ya no viaja por localStorage/sessionStorage ni por un header manual (auditoria
  // tecnica, hallazgo P1): el navegador adjunta la cookie HttpOnly solo, por eso ya no hay
  // interceptor de request que probar. "withCredentials"/"withXSRFToken" son configuracion
  // estatica de axios.create(), no comportamiento dinamico -- se verifican leyendo la
  // instancia en vez de simulando una peticion.
  it('esta configurado para enviar la cookie de sesion y el header CSRF', () => {
    expect(apiClient.defaults.withCredentials).toBe(true)
    expect(apiClient.defaults.withXSRFToken).toBe(true)
    expect(apiClient.defaults.xsrfCookieName).toBe('XSRF-TOKEN')
    expect(apiClient.defaults.xsrfHeaderName).toBe('X-XSRF-TOKEN')
  })

  it('ante un 401 limpia el perfil cacheado y redirige a /login', async () => {
    localStorage.setItem('user', '{"username":"admin"}')

    await expect(responseRejected({ response: { status: 401 } } as AxiosError)).rejects.toBeDefined()

    expect(localStorage.getItem('user')).toBeNull()
    expect(window.location.href).toBe('/login')
  })

  it('ante un 401 ya estando en /login, no redirige de nuevo', async () => {
    setLocation('/login')

    await expect(responseRejected({ response: { status: 401 } } as AxiosError)).rejects.toBeDefined()

    expect(window.location.href).toBe('')
  })

  it('ante otros codigos de error no toca el perfil cacheado', async () => {
    localStorage.setItem('user', '{"username":"admin"}')

    await expect(responseRejected({ response: { status: 500 } } as AxiosError)).rejects.toBeDefined()

    expect(localStorage.getItem('user')).toBe('{"username":"admin"}')
    expect(window.location.href).toBe('')
  })
})

describe('interceptor de respuestas: caso exitoso', () => {
  it('deja pasar la respuesta sin modificarla', () => {
    const handlers = (apiClient.interceptors.response as unknown as InterceptorHandlers<unknown>).handlers
    const respuesta = { data: { ok: true }, status: 200 }
    expect(handlers[0]!.fulfilled(respuesta)).toBe(respuesta)
  })
})
