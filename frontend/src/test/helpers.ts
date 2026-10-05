import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { screen } from '@testing-library/react'
import { vi, type Mock } from 'vitest'
import type { User } from '../types/domain'

/** Error de axios con el mensaje del backend (`{message}`), sin recurrir a `as any`. */
export function axiosErrorWithMessage(message: string, status = 400): AxiosError {
  const response: AxiosResponse<{ message: string }> = {
    data: { message },
    status,
    statusText: String(status),
    headers: {},
    config: {} as InternalAxiosRequestConfig,
  }
  return new AxiosError(message, undefined, undefined, undefined, response)
}

export const adminUser: User = { username: 'admin', fullName: 'Administrador Demo', role: 'ADMIN' }
export const driverUser: User = { username: 'conductor', fullName: 'Conductor Demo', role: 'CONDUCTOR' }

/** Respuesta de axios minima para `mockResolvedValue`. */
export function ok<T>(data: T): AxiosResponse<T> {
  return { data, status: 200, statusText: 'OK', headers: {}, config: {} as InternalAxiosRequestConfig }
}

/** jsdom no implementa <dialog>.showModal/close: se simulan marcando el atributo `open`. */
export function mockDialog() {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open') }
}

/** Lee el contenido de un Blob (el de jsdom no tiene `.text()` fiable). */
export function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

interface FakeMarker {
  bindPopup: Mock<(content: HTMLElement) => FakeMarker>
  addTo: Mock<(target: unknown) => FakeMarker>
}
interface FakeMap {
  setView: Mock<(center: unknown, zoom?: number) => FakeMap>
  remove: Mock<() => void>
  fitBounds: Mock<(bounds: unknown, options?: unknown) => void>
  invalidateSize: Mock<() => void>
}
interface FakeLayer {
  clearLayers: Mock<() => void>
  addTo: Mock<(target: unknown) => FakeLayer>
}
interface FakeTile {
  addTo: Mock<(target: unknown) => void>
}
export interface LeafletMock {
  L: {
    map: Mock<(container: unknown) => FakeMap>
    tileLayer: Mock<(url: string, options?: unknown) => FakeTile>
    layerGroup: Mock<() => FakeLayer>
    circleMarker: Mock<(latlng: [number, number], options: { color: string; radius: number }) => FakeMarker>
  }
  map: FakeMap
  layer: FakeLayer
  marker: FakeMarker
  tile: FakeTile
}

/** Doble de Leaflet para pruebas: registra las llamadas sin dibujar un mapa real. */
export function createLeafletMock(): LeafletMock {
  const map: FakeMap = {
    setView: vi.fn<(center: unknown, zoom?: number) => FakeMap>(() => map),
    remove: vi.fn<() => void>(),
    fitBounds: vi.fn<(bounds: unknown, options?: unknown) => void>(),
    invalidateSize: vi.fn<() => void>(),
  }
  const layer: FakeLayer = { clearLayers: vi.fn<() => void>(), addTo: vi.fn<(target: unknown) => FakeLayer>(() => layer) }
  const marker: FakeMarker = {
    bindPopup: vi.fn<(content: HTMLElement) => FakeMarker>(() => marker),
    addTo: vi.fn<(target: unknown) => FakeMarker>(() => marker),
  }
  const tile: FakeTile = { addTo: vi.fn<(target: unknown) => void>() }
  const L: LeafletMock['L'] = {
    map: vi.fn<(container: unknown) => FakeMap>(() => map),
    tileLayer: vi.fn<(url: string, options?: unknown) => FakeTile>(() => tile),
    layerGroup: vi.fn<() => FakeLayer>(() => layer),
    circleMarker: vi.fn<(latlng: [number, number], options: { color: string; radius: number }) => FakeMarker>(() => marker),
  }
  return { L, map, layer, marker, tile }
}

/** Nodo con el valor de una tarjeta `Stat`, localizado por su etiqueta (evita ambiguedades con tablas y leyendas). */
export function statValue(label: string): ChildNode | null {
  const el = screen.getAllByText(label).find((n) => n.classList.contains('stat-label'))
  if (!el) throw new Error(`No hay una tarjeta con la etiqueta "${label}"`)
  return el.nextSibling
}
