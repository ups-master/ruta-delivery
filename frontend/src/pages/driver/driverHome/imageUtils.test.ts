import { afterEach, describe, expect, it, vi } from 'vitest'
import { compressImage, computeResizedDimensions } from './imageUtils'

// La foto de evidencia (Fase2 §3.5) se comprime a 1280px/calidad 0.7 antes de subirla;
// computeResizedDimensions decide el tamano final y se prueba con valores reales.
// compressImage() usa FileReader/Image/<canvas>, que jsdom no implementa de verdad: sus
// pruebas (al final) usan dobles de esas tres piezas y comprueban el flujo y los errores,
// no la calidad de la compresion.
describe('computeResizedDimensions', () => {
  it('no cambia el tamano si ya esta dentro del limite', () => {
    expect(computeResizedDimensions(800, 600, 1280)).toEqual({ width: 800, height: 600 })
  })

  it('reduce el ancho cuando la imagen es mas ancha que alta y excede el limite', () => {
    // 2560x1440 (16:9) -> el ancho manda, se reescala a 1280 conservando proporcion.
    expect(computeResizedDimensions(2560, 1440, 1280)).toEqual({ width: 1280, height: 720 })
  })

  it('reduce el alto cuando la imagen es mas alta que ancha y excede el limite', () => {
    // 1440x2560 (retrato, tipico de una foto tomada con el celular en vertical).
    expect(computeResizedDimensions(1440, 2560, 1280)).toEqual({ width: 720, height: 1280 })
  })

  it('una imagen cuadrada usa la rama de "height > maxDimension" (ancho == alto no entra en la primera condicion)', () => {
    expect(computeResizedDimensions(2000, 2000, 1280)).toEqual({ width: 1280, height: 1280 })
  })

  it('respeta un maxDimension distinto al default (usado por el OCR: 1600)', () => {
    expect(computeResizedDimensions(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 })
  })

  it('no altera una imagen mas ancha que el limite pero con menos alto que el limite', () => {
    // Caso borde: width > maxDimension pero width <= height (no deberia entrar en la
    // primera rama, que exige width > height Y width > maxDimension).
    expect(computeResizedDimensions(100, 2000, 1280)).toEqual({ width: 64, height: 1280 })
  })
})

describe('compressImage (con dobles de FileReader, Image y canvas)', () => {
  const originals = { FileReader: globalThis.FileReader, Image: globalThis.Image, createElement: document.createElement.bind(document) }

  afterEach(() => {
    globalThis.FileReader = originals.FileReader
    globalThis.Image = originals.Image
    vi.restoreAllMocks()
  })

  function stub({ readerFails = false, imageFails = false, width = 2560, height = 1440 } = {}) {
    class FakeReader {
      result: string | null = 'data:image/png;base64,ORIGINAL'
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsDataURL() { queueMicrotask(() => (readerFails ? this.onerror?.() : this.onload?.())) }
    }
    class FakeImage {
      width = width
      height = height
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => (imageFails ? this.onerror?.() : this.onload?.())) }
    }
    const drawImage = vi.fn()
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ({ drawImage })), toDataURL: vi.fn(() => 'data:image/jpeg;base64,COMPRIMIDA') }
    globalThis.FileReader = FakeReader as unknown as typeof FileReader
    globalThis.Image = FakeImage as unknown as typeof Image
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
      (tag === 'canvas' ? canvas : originals.createElement(tag)) as HTMLElement)
    return { canvas, drawImage }
  }

  it('reescala al limite, dibuja en el canvas y devuelve un JPEG con la calidad pedida', async () => {
    const { canvas, drawImage } = stub()

    const result = await compressImage(new File(['x'], 'foto.png'), 1280, 0.7)

    expect(result).toBe('data:image/jpeg;base64,COMPRIMIDA')
    expect({ w: canvas.width, h: canvas.height }).toEqual({ w: 1280, h: 720 })
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1280, 720)
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.7)
  })

  it('usa 1280 px y calidad 0,7 por defecto', async () => {
    const { canvas } = stub({ width: 3000, height: 3000 })
    await compressImage(new File(['x'], 'foto.png'))
    expect({ w: canvas.width, h: canvas.height }).toEqual({ w: 1280, h: 1280 })
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.7)
  })

  it('no agranda una imagen que ya cabe', async () => {
    const { canvas } = stub({ width: 640, height: 480 })
    await compressImage(new File(['x'], 'chica.png'))
    expect({ w: canvas.width, h: canvas.height }).toEqual({ w: 640, h: 480 })
  })

  it('rechaza con un mensaje claro si no se puede leer el archivo', async () => {
    stub({ readerFails: true })
    await expect(compressImage(new File(['x'], 'rota.png'))).rejects.toThrow('No se pudo leer la imagen.')
  })

  it('rechaza si el archivo no es una imagen valida', async () => {
    stub({ imageFails: true })
    await expect(compressImage(new File(['x'], 'texto.txt'))).rejects.toThrow('No se pudo procesar la imagen.')
  })
})
