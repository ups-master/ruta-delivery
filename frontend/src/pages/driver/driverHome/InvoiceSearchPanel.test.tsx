import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Invoice } from '../../../types/domain'
import { InvoiceSearchPanel } from './InvoiceSearchPanel'

const invoices: Invoice[] = [
  { id: 1, number: 'F-001', partnerName: 'Cliente Uno', deliveryAddress: 'Calle 1', invoiceDate: '2026-10-05', state: 'posted', expectedLatitude: null, expectedLongitude: null },
  { id: 2, number: 'F-002', partnerName: 'Cliente Dos', deliveryAddress: null, invoiceDate: '2026-10-05', state: 'posted', expectedLatitude: null, expectedLongitude: null },
]

function setup(overrides: Partial<React.ComponentProps<typeof InvoiceSearchPanel>> = {}) {
  const props: React.ComponentProps<typeof InvoiceSearchPanel> = {
    query: '',
    onQueryChange: vi.fn(),
    onSearchSubmit: vi.fn((e: React.FormEvent) => e.preventDefault()),
    searching: false,
    scanning: false,
    scanInputRef: createRef<HTMLInputElement>(),
    onScanSelected: vi.fn(),
    hasSearched: false,
    invoices: [],
    searchError: '',
    feedback: null,
    onSelectInvoice: vi.fn(),
    ...overrides,
  }
  render(<InvoiceSearchPanel {...props} />)
  return props
}

describe('InvoiceSearchPanel', () => {
  it('antes de buscar muestra la guia de tres pasos', () => {
    setup()
    expect(screen.getByText('UNA ENTREGA EN TRES PASOS')).toBeInTheDocument()
    expect(screen.queryByText('Pedidos encontrados')).not.toBeInTheDocument()
  })

  it('escribe la consulta y envia la busqueda', async () => {
    const props = setup()
    await userEvent.type(screen.getByLabelText('Número de factura o cliente'), 'F')
    expect(props.onQueryChange).toHaveBeenCalledWith('F')

    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(props.onSearchSubmit).toHaveBeenCalledTimes(1)
  })

  it('lista los pedidos encontrados y permite abrir uno', async () => {
    const props = setup({ hasSearched: true, invoices })
    expect(screen.getByText('2 resultados')).toBeInTheDocument()
    expect(screen.getByText('Calle 1')).toBeInTheDocument()

    await userEvent.click(screen.getByText('F-002'))
    expect(props.onSelectInvoice).toHaveBeenCalledWith(invoices[1])
  })

  it('indica que esta buscando y bloquea los botones', () => {
    setup({ hasSearched: true, searching: true })
    expect(screen.getByText('Buscando…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Escanear factura/ })).toBeDisabled()
  })

  it('muestra el estado vacio cuando la busqueda no devuelve nada', () => {
    setup({ hasSearched: true })
    expect(screen.getByText('No hay facturas pendientes de entrega con ese criterio.')).toBeInTheDocument()
  })

  it('con un error de busqueda lo muestra y no muestra el estado vacio', () => {
    setup({ hasSearched: true, searchError: 'Error buscando la factura.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Error buscando la factura.')
    expect(screen.queryByText('No hay facturas pendientes de entrega con ese criterio.')).not.toBeInTheDocument()
  })

  it('muestra el mensaje de exito de la ultima entrega', () => {
    setup({ feedback: { type: 'success', message: 'Entrega confirmada.' } })
    expect(screen.getByText('Entrega confirmada.')).toHaveClass('success-text')
  })

  it('muestra la advertencia cuando la entrega se confirmo sin foto', () => {
    setup({ feedback: { type: 'warning', message: 'Confirmada, pero la foto no se guardo.' } })
    expect(screen.getByText('Confirmada, pero la foto no se guardo.')).toHaveClass('warning-text')
  })

  it('el boton de escaneo abre el selector de la camara y avisa del archivo elegido', async () => {
    const scanInputRef = createRef<HTMLInputElement>()
    const props = setup({ scanInputRef })
    const clic = vi.spyOn(scanInputRef.current!, 'click')
    await userEvent.click(screen.getByRole('button', { name: /Escanear factura con la cámara/ }))
    expect(clic).toHaveBeenCalledTimes(1)

    fireEvent.change(scanInputRef.current!, { target: { files: [new File(['x'], 'f.jpg', { type: 'image/jpeg' })] } })
    expect(props.onScanSelected).toHaveBeenCalled()
  })

  it('mientras lee la factura cambia el texto del boton', () => {
    setup({ scanning: true })
    expect(screen.getByRole('button', { name: /Leyendo factura/ })).toBeDisabled()
  })
})
