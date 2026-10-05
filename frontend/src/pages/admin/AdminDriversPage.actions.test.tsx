import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import apiClient from '../../api/client'
import { axiosErrorWithMessage, ok } from '../../test/helpers'
import type { Driver, PageResponse } from '../../types/domain'
import AdminDriversPage from './AdminDriversPage'

vi.mock('../../api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
const api = vi.mocked(apiClient, { deep: true })

const ana: Driver = { id: 1, username: 'ana', fullName: 'Ana Admin', role: 'ADMIN', active: true }
const luis: Driver = { id: 2, username: 'luis', fullName: 'Luis Conductor', role: 'CONDUCTOR', active: false }
const page = (content: Driver[], totalPages = 1): PageResponse<Driver> => ({ content, page: 0, size: 100, totalElements: content.length, totalPages })

describe('AdminDriversPage: acciones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue(ok(page([ana, luis])))
  })

  it('cuenta personas, cuentas activas y conductores', async () => {
    render(<AdminDriversPage />)
    expect(await screen.findByText('luis')).toBeInTheDocument()
    expect(screen.getByText('Personas en el equipo').nextSibling).toHaveTextContent('2')
    expect(screen.getByText('Cuentas activas').nextSibling).toHaveTextContent('1')
    expect(screen.getByText('Conductores').nextSibling).toHaveTextContent('1')
  })

  it('crea un usuario con los datos del formulario y recarga la lista', async () => {
    api.post.mockResolvedValueOnce(ok(luis))
    render(<AdminDriversPage />)
    await screen.findByText('luis')

    await userEvent.type(screen.getByLabelText('Usuario'), 'marta')
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Marta Perez')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreta1')
    await userEvent.selectOptions(screen.getByLabelText('Rol'), 'ADMIN')
    await userEvent.click(screen.getByRole('button', { name: 'Agregar al equipo' }))

    expect(api.post).toHaveBeenCalledWith('/admin/users', { username: 'marta', fullName: 'Marta Perez', password: 'secreta1', role: 'ADMIN' })
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText('Usuario')).toHaveValue('')
  })

  it('muestra el error si no se puede crear el usuario (p. ej. nombre repetido)', async () => {
    api.post.mockRejectedValueOnce(axiosErrorWithMessage('Ya existe un usuario con ese nombre', 409))
    render(<AdminDriversPage />)
    await screen.findByText('luis')

    await userEvent.type(screen.getByLabelText('Usuario'), 'ana')
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Otra Ana')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreta1')
    await userEvent.click(screen.getByRole('button', { name: 'Agregar al equipo' }))

    expect(await screen.findByText('Ya existe un usuario con ese nombre')).toBeInTheDocument()
  })

  it('activa a un usuario inactivo enviando active=true sin tocar su contraseña', async () => {
    api.put.mockResolvedValueOnce(ok(luis))
    render(<AdminDriversPage />)
    await screen.findByText('luis')

    await userEvent.click(screen.getByRole('button', { name: 'Activar' }))

    expect(api.put).toHaveBeenCalledWith('/admin/users/2', { fullName: 'Luis Conductor', active: true, password: null })
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
  })

  it('elimina a un usuario solo si se confirma', async () => {
    api.delete.mockResolvedValue(ok(null))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<AdminDriversPage />)
    await screen.findByText('luis')
    const eliminar = screen.getAllByRole('button', { name: 'Eliminar' })

    await userEvent.click(eliminar[1])
    expect(api.delete).not.toHaveBeenCalled()

    await userEvent.click(eliminar[1])
    expect(confirm).toHaveBeenCalledWith('¿Eliminar al usuario luis?')
    expect(api.delete).toHaveBeenCalledWith('/admin/users/2')
    confirm.mockRestore()
  })

  it('muestra el error del backend si el usuario tiene historial y no se puede eliminar', async () => {
    api.delete.mockRejectedValueOnce(axiosErrorWithMessage('El usuario tiene entregas registradas', 409))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<AdminDriversPage />)
    await screen.findByText('luis')

    await userEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[1])

    expect(await screen.findByText('El usuario tiene entregas registradas')).toBeInTheDocument()
  })

  it('navega entre paginas cuando hay mas de una', async () => {
    api.get.mockResolvedValue(ok(page([ana], 2)))
    render(<AdminDriversPage />)
    await screen.findByText('Pagina 1 de 2')
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/admin/users', { params: { page: 1, size: 100 } }))
  })
})
