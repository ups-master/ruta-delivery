import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { adminUser, axiosErrorWithMessage, driverUser } from '../test/helpers'
import { Providers } from '../test/Providers'
import type { User } from '../types/domain'
import LoginPage from './LoginPage'

function setup(login: (u: string, p: string, r?: boolean) => Promise<User>) {
  render(
    <Providers auth={{ login }} route="/login">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin" element={<p>panel de administracion</p>} />
        <Route path="/driver" element={<p>pantalla del conductor</p>} />
      </Routes>
    </Providers>
  )
}

async function fill(user = 'conductor', pass = 'secreta') {
  await userEvent.type(screen.getByLabelText('Usuario'), user)
  await userEvent.type(screen.getByLabelText('Contraseña'), pass)
}

describe('LoginPage', () => {
  it('un administrador entra al panel y recuerda la sesion por defecto', async () => {
    const login = vi.fn().mockResolvedValue(adminUser)
    setup(login)
    await fill('admin', 'clave')
    await userEvent.click(screen.getByRole('button', { name: /Entrar a mi espacio/ }))

    expect(login).toHaveBeenCalledWith('admin', 'clave', true)
    expect(await screen.findByText('panel de administracion')).toBeInTheDocument()
  })

  it('un conductor entra a su pantalla; sin "mantener sesion" se pide recordar=false', async () => {
    const login = vi.fn().mockResolvedValue(driverUser)
    setup(login)
    await fill()
    await userEvent.click(screen.getByLabelText('Mantener mi sesión'))
    await userEvent.click(screen.getByRole('button', { name: /Entrar a mi espacio/ }))

    expect(login).toHaveBeenCalledWith('conductor', 'secreta', false)
    expect(await screen.findByText('pantalla del conductor')).toBeInTheDocument()
  })

  it('muestra el mensaje del backend si las credenciales son invalidas', async () => {
    setup(vi.fn().mockRejectedValue(axiosErrorWithMessage('Credenciales invalidas', 401)))
    await fill()
    await userEvent.click(screen.getByRole('button', { name: /Entrar a mi espacio/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales invalidas')
    expect(screen.queryByText('pantalla del conductor')).not.toBeInTheDocument()
  })

  it('usa un mensaje generico ante un error inesperado', async () => {
    setup(vi.fn().mockRejectedValue('fallo'))
    await fill()
    await userEvent.click(screen.getByRole('button', { name: /Entrar a mi espacio/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo iniciar sesion.')
  })

  it('deshabilita el boton mientras ingresa', async () => {
    let resolve: (u: User) => void = () => {}
    setup(vi.fn(() => new Promise<User>((r) => { resolve = r })))
    await fill()
    await userEvent.click(screen.getByRole('button', { name: /Entrar a mi espacio/ }))

    expect(screen.getByRole('button', { name: /Ingresando/ })).toBeDisabled()
    resolve(driverUser)
    await waitFor(() => expect(screen.getByText('pantalla del conductor')).toBeInTheDocument())
  })

  it('el ojo alterna entre ocultar y mostrar la contraseña', async () => {
    setup(vi.fn())
    const input = screen.getByLabelText('Contraseña')
    expect(input).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(input).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }))
    expect(input).toHaveAttribute('type', 'password')
  })
})
