import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compressImage } from './imageUtils'
import { scanInvoiceNumber } from './invoiceOcr'

const tesseract = vi.hoisted(() => ({ recognize: vi.fn() }))
vi.mock('tesseract.js', () => ({ default: tesseract }))
vi.mock('./imageUtils', () => ({ compressImage: vi.fn() }))

describe('scanInvoiceNumber', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(compressImage).mockResolvedValue('data:image/jpeg;base64,FOTO')
  })

  it('comprime la foto a 1600 px, la lee con los recursos locales de Tesseract y devuelve el numero de factura', async () => {
    tesseract.recognize.mockResolvedValue({ data: { text: 'FACTURA No. 046-101-000005884\nRUC 0990000000001' } })
    const file = new File(['x'], 'factura.jpg')

    await expect(scanInvoiceNumber(file)).resolves.toBe('046-101-000005884')

    expect(compressImage).toHaveBeenCalledWith(file, 1600, 0.85)
    expect(tesseract.recognize).toHaveBeenCalledWith('data:image/jpeg;base64,FOTO', 'eng', {
      workerPath: '/tesseract-assets/worker.min.js',
      corePath: '/tesseract-assets',
      langPath: '/tesseract-assets',
    })
  })

  it('devuelve null si el texto leido no contiene ningun numero util', async () => {
    tesseract.recognize.mockResolvedValue({ data: { text: 'sin numeros aqui' } })
    await expect(scanInvoiceNumber(new File(['x'], 'borrosa.jpg'))).resolves.toBeNull()
  })

  it('propaga el error si el lector falla', async () => {
    tesseract.recognize.mockRejectedValue(new Error('worker caido'))
    await expect(scanInvoiceNumber(new File(['x'], 'f.jpg'))).rejects.toThrow('worker caido')
  })
})
