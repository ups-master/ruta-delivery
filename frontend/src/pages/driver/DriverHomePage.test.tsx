import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import apiClient from '../../api/client'
import { axiosErrorWithMessage, driverUser, ok } from '../../test/helpers'
import { Providers } from '../../test/Providers'
import type { Invoice, InvoiceLine } from '../../types/domain'
import DriverHomePage from './DriverHomePage'
import { getCurrentPosition } from './driverHome/geolocation'
import { compressImage } from './driverHome/imageUtils'
import { scanInvoiceNumber } from './driverHome/invoiceOcr'

vi.mock('../../api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('./driverHome/geolocation', () => ({ getCurrentPosition: vi.fn() }))
vi.mock('./driverHome/imageUtils', () => ({ compressImage: vi.fn() }))
vi.mock('./driverHome/invoiceOcr', () => ({ scanInvoiceNumber: vi.fn() }))

const api = vi.mocked(apiClient, { deep: true })
const gps = vi.mocked(getCurrentPosition)
const compress = vi.mocked(compressImage)
const scan = vi.mocked(scanInvoiceNumber)

const invoice: Invoice = {
  id: 1, number: 'F-001', partnerName: 'Cliente Uno', deliveryAddress: 'Calle 1', invoiceDate: '2026-10-05', state: 'posted',
  expectedLatitude: -2.17, expectedLongitude: -79.92,
}
const lines: InvoiceLine[] = [{ id: 10, description: 'Arroz 1 kg', quantity: 2 }, { id: 11, description: 'Aceite 1 l', quantity: 1 }]
const position = (latitude: number, longitude: number) => ({ coords: { latitude, longitude } }) as GeolocationPosition
const NEAR = position(-2.1701, -79.9201) // a ~15 m de la direccion
const FAR = position(-2.0, -79.0) // a ~100 km

function serve(found: Invoice[] = [invoice]) {
  api.get.mockImplementation((url: string) =>
    Promise.resolve(ok(url.endsWith('/lines') ? lines : found)) as never
  )
}

function renderPage() {
  return render(<Providers user={driverUser}><DriverHomePage /></Providers>)
}

async function search(text = 'F-001') {
  await userEvent.type(screen.getByLabelText('Número de factura o cliente'), text)
  await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))
}

async function openInvoice() {
  await search()
  await userEvent.click(await screen.findByText('F-001'))
  await screen.findByText('Arroz 1 kg')
}

async function completeForm(pin = '123456') {
  for (const box of screen.getAllByRole('checkbox')) await userEvent.click(box)
  const file = new File(['x'], 'evidencia.jpg', { type: 'image/jpeg' })
  fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, { target: { files: [file] } })
  await screen.findByAltText('Evidencia de entrega')
  await userEvent.type(screen.getByLabelText('Dígito 1 del PIN'), pin)
}

describe('DriverHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('crypto', { randomUUID: () => 'clave-fija' })
    serve()
    gps.mockResolvedValue(NEAR)
    compress.mockResolvedValue('data:image/jpeg;base64,AAA')
  })

  describe('busqueda', () => {
    it('saluda al conductor por su primer nombre y muestra la guia inicial', () => {
      renderPage()
      expect(screen.getByRole('heading', { name: 'Hola, Conductor.' })).toBeInTheDocument()
      expect(screen.getByText('UNA ENTREGA EN TRES PASOS')).toBeInTheDocument()
    })

    it('busca la factura y muestra los resultados', async () => {
      renderPage()
      await search()

      expect(await screen.findByText('Cliente Uno')).toBeInTheDocument()
      expect(api.get).toHaveBeenCalledWith('/driver/invoices', { params: { q: 'F-001' } })
    })

    it('no busca si la consulta esta vacia', async () => {
      renderPage()
      await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))
      expect(api.get).not.toHaveBeenCalled()
    })

    it('avisa si la sesion expiro (401)', async () => {
      api.get.mockRejectedValue(axiosErrorWithMessage('no autorizado', 401))
      renderPage()
      await search()
      expect(await screen.findByText('Tu sesion expiro. Iniciando sesion de nuevo...')).toBeInTheDocument()
    })

    it('muestra el mensaje del servidor si la busqueda falla por otro motivo', async () => {
      api.get.mockRejectedValue(axiosErrorWithMessage('Servicio no disponible', 503))
      renderPage()
      await search()
      expect(await screen.findByText('Servicio no disponible')).toBeInTheDocument()
    })

    it('indica cuando no hay facturas pendientes con ese criterio', async () => {
      serve([])
      renderPage()
      await search('inexistente')
      expect(await screen.findByText('No hay facturas pendientes de entrega con ese criterio.')).toBeInTheDocument()
    })
  })

  describe('escaneo de la factura con la camara', () => {
    const elegirFoto = () => fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['x'], 'factura.jpg', { type: 'image/jpeg' })] },
    })

    it('lee el numero de la foto y busca esa factura', async () => {
      scan.mockResolvedValue('F-001')
      renderPage()
      elegirFoto()

      expect(await screen.findByText('Cliente Uno')).toBeInTheDocument()
      expect(api.get).toHaveBeenCalledWith('/driver/invoices', { params: { q: 'F-001' } })
      expect(screen.getByLabelText('Número de factura o cliente')).toHaveValue('F-001')
    })

    it('pide escribirlo a mano si no se reconoce ningun numero', async () => {
      scan.mockResolvedValue(null)
      renderPage()
      elegirFoto()
      expect(await screen.findByText('No se pudo leer un numero de factura en la foto. Escribelo manualmente.')).toBeInTheDocument()
      expect(api.get).not.toHaveBeenCalled()
    })

    it('muestra el error del lector si falla', async () => {
      scan.mockRejectedValue(new Error('OCR no disponible'))
      renderPage()
      elegirFoto()
      expect(await screen.findByText('OCR no disponible')).toBeInTheDocument()
    })

    it('si no se elige ningun archivo no hace nada', () => {
      renderPage()
      fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, { target: { files: [] } })
      expect(scan).not.toHaveBeenCalled()
    })
  })

  describe('revision del pedido', () => {
    it('al elegir una factura carga sus productos y obtiene la ubicacion', async () => {
      renderPage()
      await openInvoice()

      expect(api.get).toHaveBeenCalledWith('/driver/invoices/1/lines')
      expect(screen.getByText('Productos (0/2)')).toBeInTheDocument()
      expect(await screen.findByText('Ubicacion lista')).toBeInTheDocument()
    })

    it('avisa si no se pudo obtener la ubicacion', async () => {
      gps.mockRejectedValue(new Error('Permiso denegado'))
      renderPage()
      await openInvoice()
      expect(await screen.findByText('No se pudo obtener tu ubicacion, se reintentara al confirmar')).toBeInTheDocument()
    })

    it('marcar y desmarcar productos actualiza el avance', async () => {
      renderPage()
      await openInvoice()
      const [primero] = screen.getAllByRole('checkbox')

      await userEvent.click(primero)
      expect(screen.getByText('Productos (1/2)')).toBeInTheDocument()
      await userEvent.click(primero)
      expect(screen.getByText('Productos (0/2)')).toBeInTheDocument()
    })

    it('"Volver a buscar" descarta la seleccion', async () => {
      renderPage()
      await openInvoice()
      await userEvent.click(screen.getByRole('button', { name: /Volver a buscar/ }))
      expect(await screen.findByText('Pedidos encontrados')).toBeInTheDocument()
    })

    it('el boton de confirmar espera productos marcados, foto y PIN completo', async () => {
      renderPage()
      await openInvoice()
      const confirmar = screen.getByRole('button', { name: 'Confirmar entrega' })
      expect(confirmar).toBeDisabled()

      await completeForm('12345')
      expect(confirmar).toBeDisabled() // el PIN esta incompleto

      await userEvent.type(screen.getByLabelText('Dígito 6 del PIN'), '6')
      expect(confirmar).toBeEnabled()
    })

    it('muestra el error si la foto no se puede procesar', async () => {
      compress.mockRejectedValue(new Error('Imagen invalida'))
      renderPage()
      await openInvoice()

      fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
        target: { files: [new File(['x'], 'mala.jpg', { type: 'image/jpeg' })] },
      })

      expect(await screen.findByText('Imagen invalida')).toBeInTheDocument()
    })

    it('muestra el error si no se cargan los productos', async () => {
      api.get.mockImplementation((url: string) =>
        url.endsWith('/lines') ? Promise.reject(axiosErrorWithMessage('Factura no encontrada', 404)) : Promise.resolve(ok([invoice])) as never
      )
      renderPage()
      await search()
      await userEvent.click(await screen.findByText('F-001'))
      expect(await screen.findByText('Factura no encontrada')).toBeInTheDocument()
    })
  })

  describe('confirmacion de la entrega', () => {
    it('envia el PIN, la foto y la ubicacion con una clave de idempotencia, y confirma la entrega', async () => {
      api.post.mockResolvedValueOnce(ok({ success: true, message: 'Entrega confirmada correctamente. Evidencia guardada.', photoUploaded: true }))
      renderPage()
      await openInvoice()
      await completeForm()

      await userEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(api.post).toHaveBeenCalledWith(
        '/driver/deliveries/confirm',
        { invoiceId: 1, pin: '123456', latitude: -2.1701, longitude: -79.9201, photoBase64: 'data:image/jpeg;base64,AAA', photoFilename: 'evidencia.jpg', photoContentType: 'image/jpeg' },
        { headers: { 'Idempotency-Key': 'clave-fija' } }
      )
      expect(await screen.findByText('ENTREGADO')).toBeInTheDocument()
      expect(await screen.findByText('Entrega confirmada correctamente. Evidencia guardada.', {}, { timeout: 3000 })).toBeInTheDocument()
      expect(screen.getByText('No hay facturas pendientes de entrega con ese criterio.')).toBeInTheDocument() // la factura ya no esta pendiente
    })

    it('si la foto no se guardo, lo muestra como advertencia', async () => {
      api.post.mockResolvedValueOnce(ok({ success: true, message: 'Confirmada, pero la foto no se guardo.', photoUploaded: false }))
      renderPage()
      await openInvoice()
      await completeForm()

      await userEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }))

      expect(await screen.findByText('Confirmada, pero la foto no se guardo.', {}, { timeout: 3000 })).toHaveClass('warning-text')
    })

    it('muestra el error del servidor si el PIN es incorrecto y permite reintentar', async () => {
      api.post.mockRejectedValueOnce(axiosErrorWithMessage('El PIN ingresado no es correcto.', 422))
      renderPage()
      await openInvoice()
      await completeForm()

      await userEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }))

      expect(await screen.findByText('El PIN ingresado no es correcto.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Confirmar entrega' })).toBeEnabled()
    })

    it('si el conductor esta a mas de 2 km pide confirmacion y, si la rechaza, no envia nada', async () => {
      gps.mockResolvedValue(FAR)
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      renderPage()
      await openInvoice()
      await completeForm()

      await userEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }))

      await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
      expect(confirm.mock.calls[0][0]).toMatch(/Estas a \d+\.\d km de la direccion registrada/)
      expect(api.post).not.toHaveBeenCalled()
      await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar entrega' })).toBeEnabled())
      confirm.mockRestore()
    })

    it('si el conductor acepta la advertencia de distancia, la entrega se envia', async () => {
      gps.mockResolvedValue(FAR)
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      api.post.mockResolvedValueOnce(ok({ success: true, message: 'ok', photoUploaded: true }))
      renderPage()
      await openInvoice()
      await completeForm()

      await userEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    })

    it('si la factura no tiene direccion registrada no compara distancias', async () => {
      serve([{ ...invoice, expectedLatitude: null, expectedLongitude: null }])
      gps.mockResolvedValue(FAR)
      const confirm = vi.spyOn(window, 'confirm')
      api.post.mockResolvedValueOnce(ok({ success: true, message: 'ok', photoUploaded: true }))
      renderPage()
      await openInvoice()
      await completeForm()

      await userEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(confirm).not.toHaveBeenCalled()
    })

    it('si no hay GPS al confirmar muestra el motivo y no envia la entrega', async () => {
      gps.mockRejectedValue(new Error('Permiso de ubicacion denegado'))
      renderPage()
      await openInvoice()
      await completeForm()

      await userEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }))

      expect(await screen.findAllByText('Permiso de ubicacion denegado')).not.toHaveLength(0)
      expect(api.post).not.toHaveBeenCalled()
    })
  })

  describe('incidencias', () => {
    async function abrirIncidencia() {
      renderPage()
      await openInvoice()
      await userEvent.click(screen.getByRole('button', { name: /reportar incidencia/ }))
      await screen.findByText('Motivo')
    }

    it('reporta una incidencia con motivo, observaciones y ubicacion', async () => {
      api.post.mockResolvedValueOnce(ok({ success: true, message: 'ok' }))
      await abrirIncidencia()

      await userEvent.selectOptions(screen.getByLabelText('Motivo de la incidencia'), 'Cliente ausente')
      await userEvent.type(screen.getByLabelText('Observaciones de la incidencia'), 'Nadie respondio')
      await userEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(api.post).toHaveBeenCalledWith(
        '/driver/deliveries/incident',
        { invoiceId: 1, invoiceNumber: 'F-001', partnerName: 'Cliente Uno', deliveryAddress: 'Calle 1', reason: 'Cliente ausente', notes: 'Nadie respondio', latitude: -2.1701, longitude: -79.9201 },
        { headers: { 'Idempotency-Key': 'clave-fija' } }
      )
      expect(await screen.findByText('Incidencia reportada para F-001.')).toBeInTheDocument()
    })

    it('se reporta igual, sin coordenadas, si el GPS no esta disponible', async () => {
      gps.mockRejectedValue(new Error('sin gps'))
      api.post.mockResolvedValueOnce(ok({ success: true, message: 'ok' }))
      await abrirIncidencia()

      await userEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(api.post.mock.calls[0][1]).toEqual(expect.objectContaining({ latitude: null, longitude: null }))
    })

    it('muestra el error del servidor y permite volver a la entrega', async () => {
      api.post.mockRejectedValueOnce(axiosErrorWithMessage('La factura indicada no existe', 400))
      await abrirIncidencia()

      await userEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }))
      expect(await screen.findByText('La factura indicada no existe')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /Volver a la entrega/ }))
      expect(await screen.findByRole('button', { name: 'Confirmar entrega' })).toBeInTheDocument()
    })
  })
})
