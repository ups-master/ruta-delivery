import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Invoice, InvoiceLine } from '../../../types/domain'
import { ConfirmDeliveryForm, type LocationState } from './ConfirmDeliveryForm'

const invoice: Invoice = {
  id: 1, number: 'F-001', partnerName: 'Cliente Uno', deliveryAddress: 'Av. Principal 123', invoiceDate: '2026-10-05',
  state: 'posted', expectedLatitude: -2.17, expectedLongitude: -79.92,
}
const lines: InvoiceLine[] = [
  { id: 10, description: 'Arroz 1 kg', quantity: 2 },
  { id: 11, description: 'Aceite 1 l', quantity: 1.5 },
]

function setup(overrides: Partial<React.ComponentProps<typeof ConfirmDeliveryForm>> = {}) {
  const props: React.ComponentProps<typeof ConfirmDeliveryForm> = {
    selectedInvoice: invoice,
    onBack: vi.fn(),
    lines,
    linesLoading: false,
    linesError: '',
    checkedIds: new Set<number>(),
    onToggleChecked: vi.fn(),
    photoInputRef: createRef<HTMLInputElement>(),
    onPhotoSelected: vi.fn(),
    photo: null,
    photoError: '',
    pin: '',
    onPinChange: vi.fn(),
    confirming: false,
    allChecked: false,
    canConfirm: false,
    locationState: 'idle',
    feedback: null,
    onSubmit: vi.fn((e: React.FormEvent) => e.preventDefault()),
    onShowIncidentForm: vi.fn(),
    ...overrides,
  }
  const view = render(<ConfirmDeliveryForm {...props} />)
  return { props, ...view }
}

describe('ConfirmDeliveryForm', () => {
  it('muestra el pedido y sus productos con cantidades formateadas', () => {
    setup()
    expect(screen.getByText('F-001')).toBeInTheDocument()
    expect(screen.getByText('Av. Principal 123')).toBeInTheDocument()
    expect(screen.getByText('Productos (0/2)')).toBeInTheDocument()
    expect(screen.getByText('2×')).toBeInTheDocument()
    expect(screen.getByText('1.50×')).toBeInTheDocument()
  })

  it('no muestra la direccion si la factura no la tiene', () => {
    setup({ selectedInvoice: { ...invoice, deliveryAddress: null } })
    expect(screen.queryByText('Av. Principal 123')).not.toBeInTheDocument()
  })

  it('al marcar un producto avisa con su id y refleja los ya marcados', async () => {
    const { props } = setup({ checkedIds: new Set([10]) })
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes[0]).toBeChecked()
    await userEvent.click(boxes[1])
    expect(props.onToggleChecked).toHaveBeenCalledWith(11)
    expect(screen.getByText('Productos (1/2)')).toBeInTheDocument()
  })

  it('indica la carga y el error de los productos, y oculta la lista mientras tanto', () => {
    const { unmount } = setup({ linesLoading: true, lines: [] })
    expect(screen.getByText('Cargando productos...')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    unmount()

    setup({ linesError: 'No se pudieron cargar los productos.', lines: [] })
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los productos.')
  })

  it('avisa si la factura no tiene productos', () => {
    setup({ lines: [] })
    expect(screen.getByText('Esta factura no tiene productos para verificar.')).toBeInTheDocument()
  })

  it('pide marcar los productos y luego tomar la foto antes de confirmar', () => {
    const { unmount } = setup()
    expect(screen.getByText('Marca todos los productos antes de confirmar.')).toBeInTheDocument()
    unmount()

    setup({ allChecked: true })
    expect(screen.getByText('Toma la foto de evidencia antes de confirmar.')).toBeInTheDocument()
  })

  it('el boton de foto abre el selector de archivos; con foto muestra la vista previa', async () => {
    const photoInputRef = createRef<HTMLInputElement>()
    const { unmount } = setup({ photoInputRef })
    const clic = vi.spyOn(photoInputRef.current!, 'click')
    await userEvent.click(screen.getByRole('button', { name: /Tomar foto de la entrega/ }))
    expect(clic).toHaveBeenCalledTimes(1)
    unmount()

    const { props } = setup({ photo: { dataUrl: 'data:image/jpeg;base64,AAA', filename: 'e.jpg' }, photoError: 'Foto muy pesada' })
    expect(screen.getByAltText('Evidencia de entrega')).toHaveAttribute('src', 'data:image/jpeg;base64,AAA')
    expect(screen.queryByRole('button', { name: /Tomar foto de la entrega/ })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Foto muy pesada')

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    fireEvent.change(input, { target: { files: [new File(['x'], 'e.jpg', { type: 'image/jpeg' })] } })
    expect(props.onPhotoSelected).toHaveBeenCalled()
  })

  it.each<[LocationState, string]>([
    ['idle', 'Ubicacion'],
    ['locating', 'Obteniendo tu ubicacion...'],
    ['ready', 'Ubicacion lista'],
    ['error', 'No se pudo obtener tu ubicacion, se reintentara al confirmar'],
  ])('muestra el estado de la ubicacion "%s"', (locationState, texto) => {
    setup({ locationState })
    expect(screen.getByRole('status')).toHaveTextContent(texto)
  })

  it('solo se puede confirmar cuando canConfirm es verdadero', async () => {
    const { props, unmount } = setup({ canConfirm: false })
    expect(screen.getByRole('button', { name: 'Confirmar entrega' })).toBeDisabled()
    unmount()

    const habilitado = setup({ canConfirm: true })
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }))
    expect(habilitado.props.onSubmit).toHaveBeenCalledTimes(1)
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it('mientras confirma deshabilita el envio y el boton de incidencia', () => {
    setup({ confirming: true, canConfirm: true })
    expect(screen.getByRole('button', { name: 'Confirmando...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /reportar incidencia/ })).toBeDisabled()
  })

  it('muestra el error devuelto por el servidor', () => {
    setup({ feedback: { type: 'error', message: 'El PIN ingresado no es correcto.' } })
    expect(screen.getByRole('alert')).toHaveTextContent('El PIN ingresado no es correcto.')
  })

  it('permite volver a buscar y reportar una incidencia', async () => {
    const { props } = setup()
    await userEvent.click(screen.getByRole('button', { name: /Volver a buscar/ }))
    expect(props.onBack).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: /reportar incidencia/ }))
    expect(props.onShowIncidentForm).toHaveBeenCalledTimes(1)
  })

  it('el PIN se escribe en las casillas y se notifica', async () => {
    const { props } = setup()
    await userEvent.type(screen.getByLabelText('Dígito 1 del PIN'), '4')
    expect(props.onPinChange).toHaveBeenCalledWith('4')
  })
})
