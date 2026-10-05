import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import apiClient from '../../api/client'
import { axiosErrorWithMessage, ok, readBlob } from '../../test/helpers'
import type { AdminInvoice, PageResponse } from '../../types/domain'
import AdminInvoicesPage from './AdminInvoicesPage'

vi.mock('../../api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
const api = vi.mocked(apiClient, { deep: true })

const base: AdminInvoice = {
  id: 1, number: 'F-001', partnerName: 'Cliente Uno', deliveryAddress: 'Calle 1', invoiceDate: '2026-10-05', state: 'draft',
  expectedLatitude: null, expectedLongitude: null, requiresPin: true, pin: null, confirmed: false, createdBy: 'admin', publishedBy: null,
}
const posted: AdminInvoice = { ...base, id: 2, number: 'F-002', state: 'posted', pin: '123456' }
const delivered: AdminInvoice = { ...base, id: 3, number: 'F-003', state: 'posted', pin: '654321', confirmed: true }
const cancelled: AdminInvoice = { ...base, id: 4, number: 'F-004', state: 'cancel', requiresPin: false }
const pageOf = (content: AdminInvoice[], totalPages = 1, totalElements = content.length): PageResponse<AdminInvoice> =>
  ({ content, page: 0, size: 20, totalElements, totalPages })

describe('AdminInvoicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue(ok(pageOf([base, posted, delivered, cancelled])))
  })

  it('lista las facturas con su estado y el PIN solo cuando existe', async () => {
    render(<AdminInvoicesPage />)
    expect(await screen.findByText('F-001')).toBeInTheDocument()

    expect(screen.getByText('Borrador')).toBeInTheDocument()
    expect(screen.getByText('Publicada')).toBeInTheDocument()
    expect(screen.getByText('Entregada')).toBeInTheDocument()
    expect(screen.getByText('Cancelada')).toBeInTheDocument()
    expect(screen.getByText('123456')).toBeInTheDocument()
    expect(screen.getByText('Sin PIN')).toBeInTheDocument()
    expect(screen.getByText('4 facturas coinciden con la búsqueda', { exact: false })).toBeInTheDocument()
  })

  it('avisa cuando la busqueda no encuentra facturas y deshabilita la exportacion', async () => {
    api.get.mockResolvedValue(ok(pageOf([])))
    render(<AdminInvoicesPage />)
    expect(await screen.findByText('No hay facturas que coincidan con la búsqueda.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar facturas y PIN' })).toBeDisabled()
  })

  it('busca por numero o cliente y vuelve a la primera pagina', async () => {
    render(<AdminInvoicesPage />)
    await screen.findByText('F-001')

    await userEvent.type(screen.getByLabelText('Buscar facturas'), 'Uno')
    await userEvent.click(screen.getByRole('button', { name: /Buscar/ }))

    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/admin/invoices', { params: { q: 'Uno', page: 0, size: 20 } }))
  })

  it('muestra el error si falla la carga', async () => {
    api.get.mockRejectedValue(axiosErrorWithMessage('Sesion expirada', 401))
    render(<AdminInvoicesPage />)
    expect(await screen.findByText('Sesion expirada')).toBeInTheDocument()
  })

  it('crea una factura: convierte numeros, permite agregar y quitar productos, y cierra el formulario', async () => {
    api.post.mockResolvedValueOnce(ok(base))
    render(<AdminInvoicesPage />)
    await screen.findByText('F-001')

    await userEvent.click(screen.getByRole('button', { name: 'Nueva factura' }))
    await userEvent.type(screen.getByLabelText('Número de factura'), 'F-100')
    await userEvent.type(screen.getByLabelText('Cliente'), 'Cliente Nuevo')
    await userEvent.type(screen.getByLabelText('Latitud (opcional)'), '-2.17')
    await userEvent.type(screen.getByLabelText('Longitud (opcional)'), '-79.92')
    await userEvent.type(screen.getByLabelText('Producto 1'), 'Arroz')
    await userEvent.click(screen.getByRole('button', { name: '+ Agregar producto' }))
    await userEvent.type(screen.getByLabelText('Producto 2'), 'Aceite')
    await userEvent.click(screen.getAllByRole('button', { name: 'Quitar' })[1])
    expect(screen.queryByLabelText('Producto 2')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    expect(api.post).toHaveBeenCalledWith('/admin/invoices', expect.objectContaining({
      number: 'F-100', partnerName: 'Cliente Nuevo', latitude: -2.17, longitude: -79.92, requiresPin: true,
      products: [{ description: 'Arroz', quantity: 1 }],
    }))
    await waitFor(() => expect(screen.queryByText('Nuevo pedido')).not.toBeInTheDocument())
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('envia coordenadas nulas si se dejan vacias y no deja quitar el unico producto', async () => {
    api.post.mockResolvedValueOnce(ok(base))
    render(<AdminInvoicesPage />)
    await screen.findByText('F-001')

    await userEvent.click(screen.getByRole('button', { name: 'Nueva factura' }))
    expect(screen.getByRole('button', { name: 'Quitar' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Número de factura'), 'F-101')
    await userEvent.type(screen.getByLabelText('Cliente'), 'Otro')
    await userEvent.type(screen.getByLabelText('Producto 1'), 'Sal')
    await userEvent.click(screen.getByLabelText('Requiere PIN de entrega'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    expect(api.post).toHaveBeenCalledWith('/admin/invoices', expect.objectContaining({ latitude: null, longitude: null, requiresPin: false }))
  })

  it('muestra el error del servidor si la factura es invalida o duplicada', async () => {
    api.post.mockRejectedValueOnce(axiosErrorWithMessage('Ya existe una factura con ese numero', 409))
    render(<AdminInvoicesPage />)
    await screen.findByText('F-001')

    await userEvent.click(screen.getByRole('button', { name: 'Nueva factura' }))
    await userEvent.type(screen.getByLabelText('Número de factura'), 'F-001')
    await userEvent.type(screen.getByLabelText('Cliente'), 'Dup')
    await userEvent.type(screen.getByLabelText('Producto 1'), 'Sal')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    expect(await screen.findByText('Ya existe una factura con ese numero')).toBeInTheDocument()
    expect(screen.getByText('Nuevo pedido')).toBeInTheDocument() // el formulario sigue abierto
  })

  it('publica un borrador y recarga la lista; solo los borradores tienen el boton', async () => {
    api.post.mockResolvedValueOnce(ok(posted))
    render(<AdminInvoicesPage />)
    await screen.findByText('F-001')
    expect(screen.getAllByRole('button', { name: 'Publicar' })).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }))

    expect(api.post).toHaveBeenCalledWith('/admin/invoices/1/publish')
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
  })

  it('muestra el error si no se puede publicar', async () => {
    api.post.mockRejectedValueOnce(axiosErrorWithMessage('Factura sin productos', 400))
    render(<AdminInvoicesPage />)
    await screen.findByText('F-001')

    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }))

    expect(await screen.findByText('Factura sin productos')).toBeInTheDocument()
  })

  it('exporta a CSV todas las paginas con numero y PIN, escapando comillas', async () => {
    const tricky: AdminInvoice = { ...posted, id: 9, number: 'F "9"', pin: '111111' }
    api.get
      .mockResolvedValueOnce(ok(pageOf([base, posted], 2, 3))) // carga inicial de la pagina
      .mockResolvedValueOnce(ok(pageOf([base, posted], 2, 3))) // exportacion, pagina 0
      .mockResolvedValueOnce(ok(pageOf([tricky], 2, 3))) // exportacion, pagina 1
    const urls: Blob[] = []
    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => { urls.push(blob as Blob); return 'blob:csv' })
    URL.revokeObjectURL = vi.fn()
    const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<AdminInvoicesPage />)
    await screen.findByText('F-001')
    await userEvent.click(screen.getByRole('button', { name: 'Exportar facturas y PIN' }))

    await waitFor(() => expect(clicks).toHaveBeenCalledTimes(1))
    expect(api.get).toHaveBeenCalledWith('/admin/invoices', { params: { q: '', page: 0, size: 100 } })
    expect(api.get).toHaveBeenCalledWith('/admin/invoices', { params: { q: '', page: 1, size: 100 } })
    const text = await readBlob(urls[0])
    expect(text).toContain('factura;pin')
    expect(text).toContain('"F-002";"123456"')
    expect(text).toContain('"F ""9""";"111111"')
    clicks.mockRestore()
  })

  it('muestra el error si falla la exportacion', async () => {
    api.get.mockResolvedValueOnce(ok(pageOf([base]))).mockRejectedValueOnce(axiosErrorWithMessage('Sin permiso', 403))
    render(<AdminInvoicesPage />)
    await screen.findByText('F-001')

    await userEvent.click(screen.getByRole('button', { name: 'Exportar facturas y PIN' }))

    expect(await screen.findByText('Sin permiso')).toBeInTheDocument()
  })

  it('pagina los resultados', async () => {
    api.get.mockResolvedValue(ok(pageOf([base], 3, 50)))
    render(<AdminInvoicesPage />)
    await screen.findByText('Página 1 de 3')
    const nav = screen.getByText('Página 1 de 3').parentElement!

    await userEvent.click(within(nav).getByRole('button', { name: 'Siguiente' }))

    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/admin/invoices', { params: { q: '', page: 1, size: 20 } }))
    await userEvent.click(within(nav).getByRole('button', { name: 'Anterior' }))
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/admin/invoices', { params: { q: '', page: 0, size: 20 } }))
  })
})
