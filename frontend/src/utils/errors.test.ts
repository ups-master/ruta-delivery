import { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'
import { axiosErrorWithMessage } from '../test/helpers'
import { getErrorMessage } from './errors'

describe('getErrorMessage', () => {
  it('usa el mensaje que envia el backend en un error de axios', () => {
    expect(getErrorMessage(axiosErrorWithMessage('El PIN ingresado no es correcto.', 422), 'fallback')).toBe(
      'El PIN ingresado no es correcto.'
    )
  })

  it('cae al texto por defecto si el error de axios no trae mensaje', () => {
    expect(getErrorMessage(new AxiosError('Network Error'), 'No se pudo cargar.')).toBe('No se pudo cargar.')
  })

  it('usa el mensaje de un Error de JavaScript', () => {
    expect(getErrorMessage(new Error('Sin camara'), 'fallback')).toBe('Sin camara')
  })

  it('acepta objetos con message que no son instancias de Error (p. ej. errores de geolocalizacion)', () => {
    expect(getErrorMessage({ code: 1, message: 'Permiso denegado' }, 'fallback')).toBe('Permiso denegado')
  })

  it('devuelve el texto por defecto cuando el mensaje esta vacio o el valor no es un error', () => {
    expect(getErrorMessage(new Error(''), 'fallback')).toBe('fallback')
    expect(getErrorMessage('texto suelto', 'fallback')).toBe('fallback')
    expect(getErrorMessage(null, 'fallback')).toBe('fallback')
    expect(getErrorMessage({ message: 42 }, 'fallback')).toBe('fallback')
  })
})
