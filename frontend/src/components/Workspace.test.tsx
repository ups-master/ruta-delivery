import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminUser, driverUser } from '../test/helpers'
import { Providers } from '../test/Providers'
import { Brand, DriverShell, Icon, Modal, PageIntro, Stat, type IconName } from './Workspace'

describe('Icon', () => {
  it('dibuja el icono pedido con el tamano indicado', () => {
    const { container } = render(<Icon name="camera" size={32} />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('width', '32')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('usa el icono de caja por defecto y si el nombre no existe', () => {
    const { container: porDefecto } = render(<Icon />)
    const { container: desconocido } = render(<Icon name={'inexistente' as IconName} />)
    expect(desconocido.querySelector('path')!.getAttribute('d')).toBe(porDefecto.querySelector('path')!.getAttribute('d'))
  })
})

describe('componentes de presentacion', () => {
  it('Brand muestra el nombre de la aplicacion', () => {
    render(<Brand />)
    expect(screen.getByText('GESTIÓN DE ENTREGAS')).toBeInTheDocument()
  })

  it('PageIntro muestra titulo, descripcion y los hijos', () => {
    render(<PageIntro eyebrow="ETIQUETA" title="Titulo" description="Descripcion"><button>Accion</button></PageIntro>)
    expect(screen.getByRole('heading', { name: 'Titulo' })).toBeInTheDocument()
    expect(screen.getByText('Descripcion')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accion' })).toBeInTheDocument()
  })

  it('Stat muestra etiqueta y valor con su tono', () => {
    const { container } = render(<Stat label="Entregas" value={7} tone="mint" icon="check" />)
    expect(screen.getByText('Entregas')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(container.querySelector('.stat-card')).toHaveClass('mint')
  })
})

describe('Modal', () => {
  beforeEach(() => {
    // jsdom no implementa <dialog>.showModal/close
    HTMLDialogElement.prototype.showModal = vi.fn()
    HTMLDialogElement.prototype.close = vi.fn()
  })

  it('se abre como modal y se cierra al desmontar', () => {
    const { unmount } = render(<Modal label="Detalle" onClose={() => {}}><p>contenido</p></Modal>)
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Detalle')).toBeInTheDocument()
    unmount()
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled()
  })

  it('la tecla Escape (evento cancel) pide cerrar sin cerrar el dialogo por su cuenta', () => {
    const onClose = vi.fn()
    render(<Modal label="Detalle" onClose={onClose}><p>contenido</p></Modal>)
    const dialog = screen.getByLabelText('Detalle')

    const cancel = new Event('cancel', { cancelable: true })
    dialog.dispatchEvent(cancel)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(cancel.defaultPrevented).toBe(true)
  })

  it('un clic fuera del cuadro cierra; un clic dentro del contenido no', () => {
    const onClose = vi.fn()
    render(<Modal label="Detalle" onClose={onClose}><p>contenido</p></Modal>)
    const dialog = screen.getByLabelText('Detalle')

    fireEvent.click(screen.getByText('contenido'))
    expect(onClose).not.toHaveBeenCalled()

    // jsdom devuelve un rectangulo vacio (0,0,0,0): un clic en (50, 50) queda fuera
    fireEvent.click(dialog, { clientX: 50, clientY: 50 })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('DriverShell', () => {
  it('muestra el nombre del conductor, sin enlace a administracion, y permite cerrar sesion', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    render(<Providers user={driverUser} auth={{ logout }}><DriverShell><p>pantalla</p></DriverShell></Providers>)

    expect(screen.getByText('Conductor Demo')).toBeInTheDocument()
    expect(screen.getByText('Conductor')).toBeInTheDocument()
    expect(screen.getByText('pantalla')).toBeInTheDocument()
    expect(screen.queryByText('Administración')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(logout).toHaveBeenCalledTimes(1)
  })

  it('un administrador ve el enlace de vuelta al panel', () => {
    render(<Providers user={adminUser}><DriverShell><p>pantalla</p></DriverShell></Providers>)
    expect(screen.getByRole('link', { name: /Administración/ })).toHaveAttribute('href', '/admin/dashboard')
    expect(screen.getByText('Administrador')).toBeInTheDocument()
  })
})
