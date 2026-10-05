import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TableSkeleton from './TableSkeleton'

describe('TableSkeleton', () => {
  it('dibuja 5 filas de 4 columnas por defecto', () => {
    const { container } = render(<TableSkeleton />)
    expect(container.querySelectorAll('tr')).toHaveLength(5)
    expect(container.querySelectorAll('td')).toHaveLength(20)
  })

  it('respeta las filas, columnas y anchos pedidos', () => {
    const { container } = render(<TableSkeleton rows={2} columns={3} widths={['10%', '20%']} />)
    const bars = container.querySelectorAll<HTMLElement>('.skeleton-bar')
    expect(bars).toHaveLength(6)
    expect(bars[0].style.width).toBe('10%')
    expect(bars[1].style.width).toBe('20%')
    expect(bars[2].style.width).toBe('70%') // sin ancho definido para la 3.ª columna
  })
})
