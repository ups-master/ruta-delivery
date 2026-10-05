import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axiosErrorWithMessage } from '../test/helpers'
import { useAsyncData } from './useAsyncData'

describe('useAsyncData', () => {
  it('empieza cargando y entrega los datos al resolver', async () => {
    const fetcher = vi.fn().mockResolvedValue(['a', 'b'])
    const { result } = renderHook(() => useAsyncData(fetcher, []))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(['a', 'b'])
    expect(result.current.error).toBe('')
  })

  it('expone el mensaje del backend cuando la carga falla', async () => {
    const fetcher = vi.fn().mockRejectedValue(axiosErrorWithMessage('Sesion expirada', 401))
    const { result } = renderHook(() => useAsyncData(fetcher, []))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Sesion expirada')
    expect(result.current.data).toBeUndefined()
  })

  it('usa un mensaje generico si el error no trae uno propio', async () => {
    const fetcher = vi.fn().mockRejectedValue('fallo raro')
    const { result } = renderHook(() => useAsyncData(fetcher, []))

    await waitFor(() => expect(result.current.error).toBe('No se pudo cargar la información.'))
  })

  it('vuelve a pedir los datos cuando cambia una dependencia', async () => {
    const fetcher = vi.fn((page: number) => Promise.resolve(`pagina ${page}`))
    const { result, rerender } = renderHook(({ page }) => useAsyncData(() => fetcher(page), [page]), {
      initialProps: { page: 0 },
    })
    await waitFor(() => expect(result.current.data).toBe('pagina 0'))

    rerender({ page: 1 })
    await waitFor(() => expect(result.current.data).toBe('pagina 1'))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('reload fuerza otra ejecucion sin cambiar dependencias', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce('uno').mockResolvedValueOnce('dos')
    const { result } = renderHook(() => useAsyncData(fetcher, []))
    await waitFor(() => expect(result.current.data).toBe('uno'))

    act(() => result.current.reload())
    await waitFor(() => expect(result.current.data).toBe('dos'))
  })

  it('setData permite actualizar el estado con la respuesta de un POST sin otro GET', async () => {
    const fetcher = vi.fn().mockResolvedValue('inicial')
    const { result } = renderHook(() => useAsyncData<string>(fetcher, []))
    await waitFor(() => expect(result.current.data).toBe('inicial'))

    act(() => result.current.setData('actualizado'))
    expect(result.current.data).toBe('actualizado')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('ignora una respuesta que llega despues de desmontar', async () => {
    let resolve: (value: string) => void = () => {}
    const fetcher = vi.fn(() => new Promise<string>((r) => { resolve = r }))
    const { result, unmount } = renderHook(() => useAsyncData(fetcher, []))

    unmount()
    await act(async () => resolve('tarde'))
    expect(result.current.data).toBeUndefined()
  })
})
