import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Invoice } from '../../../types/domain'
import { IncidentForm } from './IncidentForm'
import { INCIDENT_REASONS } from './incidentReasons'

const invoice: Invoice = {
  id: 7, number: 'F-007', partnerName: 'Cliente Siete', deliveryAddress: 'Calle 7', invoiceDate: '2026-10-05',
  state: 'posted', expectedLatitude: null, expectedLongitude: null,
}

function setup(overrides: Partial<React.ComponentProps<typeof IncidentForm>> = {}) {
  const props = {
    selectedInvoice: invoice,
    onBack: vi.fn(),
    incidentReason: INCIDENT_REASONS[0] as string,
    onIncidentReasonChange: vi.fn(),
    incidentNotes: '',
    onIncidentNotesChange: vi.fn(),
    incidentError: '',
    reportingIncident: false,
    onSubmit: vi.fn((e: React.FormEvent) => e.preventDefault()),
    ...overrides,
  }
  render(<IncidentForm {...props} />)
  return props
}

describe('IncidentForm', () => {
  it('muestra la factura y los cinco motivos predefinidos', () => {
    setup()
    expect(screen.getByText('F-007')).toBeInTheDocument()
    expect(screen.getByText('Cliente Siete')).toBeInTheDocument()
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([...INCIDENT_REASONS])
  })

  it('notifica el cambio de motivo y de observaciones', async () => {
    const props = setup()
    await userEvent.selectOptions(screen.getByLabelText('Motivo de la incidencia'), 'Cliente ausente')
    expect(props.onIncidentReasonChange).toHaveBeenCalledWith('Cliente ausente')

    fireEvent.change(screen.getByLabelText('Observaciones de la incidencia'), { target: { value: 'Nadie respondio' } })
    expect(props.onIncidentNotesChange).toHaveBeenCalledWith('Nadie respondio')
  })

  it('envia el reporte y permite volver a la entrega', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }))
    expect(props.onSubmit).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: /Volver a la entrega/ }))
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })

  it('muestra el error y deshabilita el boton mientras se envia', () => {
    setup({ incidentError: 'No se pudo reportar la incidencia.', reportingIncident: true })
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo reportar la incidencia.')
    expect(screen.getByRole('button', { name: 'Enviando...' })).toBeDisabled()
  })
})
