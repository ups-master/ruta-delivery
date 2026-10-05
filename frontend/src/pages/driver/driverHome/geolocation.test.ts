import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentPosition } from './geolocation'

function setGeolocation(value: Partial<Geolocation> | undefined) {
  Object.defineProperty(navigator, 'geolocation', { value, configurable: true })
}

describe('getCurrentPosition', () => {
  afterEach(() => {
    setGeolocation(undefined)
  })

  it('rechaza si el dispositivo no soporta geolocalizacion', async () => {
    setGeolocation(undefined)
    await expect(getCurrentPosition()).rejects.toThrow('no soporta geolocalizacion')
  })

  it('resuelve con la posicion y pide alta precision sin cache', async () => {
    const position = { coords: { latitude: -2.17, longitude: -79.92 } } as GeolocationPosition
    const getter = vi.fn((success: PositionCallback) => success(position))
    setGeolocation({ getCurrentPosition: getter })

    await expect(getCurrentPosition()).resolves.toBe(position)
    expect(getter).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
  })

  it('rechaza con el error del navegador si el usuario niega el permiso', async () => {
    const denied = { code: 1, message: 'User denied Geolocation' } as GeolocationPositionError
    setGeolocation({ getCurrentPosition: (_ok: PositionCallback, fail?: PositionErrorCallback | null) => fail?.(denied) })

    await expect(getCurrentPosition()).rejects.toBe(denied)
  })
})
