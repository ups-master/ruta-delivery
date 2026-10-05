import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PIN_LENGTH, PinBoxes } from './PinBoxes'

function Controlled({ onValue, disabled }: { onValue?: (v: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState('')
  return <PinBoxes value={value} disabled={disabled} onChange={(v) => { setValue(v); onValue?.(v) }} />
}

const boxes = () => screen.getAllByLabelText(/Dígito \d del PIN/) as HTMLInputElement[]

describe('PinBoxes', () => {
  it('dibuja seis casillas vacias', () => {
    render(<Controlled />)
    expect(PIN_LENGTH).toBe(6)
    expect(boxes()).toHaveLength(6)
    expect(boxes().every((b) => b.value === '')).toBe(true)
  })

  it('al escribir un digito pasa el foco a la casilla siguiente', async () => {
    render(<Controlled />)
    await userEvent.type(boxes()[0], '123456')
    expect(boxes().map((b) => b.value).join('')).toBe('123456')
  })

  it('ignora todo lo que no sea un digito', async () => {
    const onValue = vi.fn()
    render(<Controlled onValue={onValue} />)
    await userEvent.type(boxes()[0], 'a-b')
    expect(boxes().every((b) => b.value === '')).toBe(true)
  })

  it('pega un PIN completo, descartando separadores y limitando a seis digitos', async () => {
    const onValue = vi.fn()
    render(<Controlled onValue={onValue} />)
    boxes()[0].focus()
    await userEvent.paste('12-34 56789')
    expect(onValue).toHaveBeenLastCalledWith('123456')
  })

  it('un pegado sin digitos deja el PIN vacio', async () => {
    render(<Controlled />)
    boxes()[0].focus()
    await userEvent.paste('abc')
    expect(boxes().every((b) => b.value === '')).toBe(true)
  })

  it('reparte varios digitos que llegan de golpe (autocompletado) desde la casilla actual', () => {
    const onValue = vi.fn()
    render(<Controlled onValue={onValue} />)
    fireEvent.change(boxes()[1], { target: { value: '789' } })
    expect(onValue).toHaveBeenLastCalledWith('789')
    expect(boxes().map((b) => b.value).join('')).toBe('789')
  })

  it('borrar un digito lo quita', async () => {
    render(<Controlled />)
    await userEvent.type(boxes()[0], '12')
    fireEvent.change(boxes()[1], { target: { value: '' } })
    expect(boxes()[1].value).toBe('')
  })

  it('Backspace en una casilla vacia mueve el foco a la anterior', async () => {
    render(<Controlled />)
    await userEvent.type(boxes()[0], '1')
    expect(boxes()[1]).toHaveFocus()
    await userEvent.keyboard('{Backspace}')
    expect(boxes()[0]).toHaveFocus()
  })

  it('deshabilita las casillas mientras se confirma', () => {
    render(<Controlled disabled />)
    expect(boxes().every((b) => b.disabled)).toBe(true)
  })
})
