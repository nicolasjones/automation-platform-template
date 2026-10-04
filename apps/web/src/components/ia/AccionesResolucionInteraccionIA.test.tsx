import { render, screen } from '@testing-library/react'
import type { EstadoInteraccion } from '@platform/ia'
import { describe, expect, it, vi } from 'vitest'
import { supabaseClient } from '../../lib/supabase'
import { AccionesResolucionInteraccionIA } from './AccionesResolucionInteraccionIA'

vi.mock('../../lib/supabase', () => ({
  supabaseClient: {
    rpc: vi.fn(),
  },
}))

describe('AccionesResolucionInteraccionIA', () => {
  it.each(['revision_humana', 'esperando_aprobacion'] as EstadoInteraccion[])(
    'muestra las tres acciones de resolución para %s',
    (estado) => {
      render(<AccionesResolucionInteraccionIA interaccionId="int-1" estado={estado} onResuelto={vi.fn()} />)

      expect(screen.getByRole('button', { name: 'Completar' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    },
  )

  it.each(['iniciada', 'preparando', 'invocando', 'respuesta_validada', 'completada', 'rechazada', 'fallida_tecnica', 'cancelada'] as EstadoInteraccion[])(
    'no muestra nada para %s',
    (estado) => {
      const { container } = render(<AccionesResolucionInteraccionIA interaccionId="int-1" estado={estado} onResuelto={vi.fn()} />)

      expect(container).toBeEmptyDOMElement()
    },
  )

  it('llama a resolver_revision_ia con el estado final elegido y avisa onResuelto', async () => {
    vi.mocked(supabaseClient.rpc).mockResolvedValue({ data: null, error: null } as never)
    const onResuelto = vi.fn()
    render(<AccionesResolucionInteraccionIA interaccionId="int-1" estado="esperando_aprobacion" onResuelto={onResuelto} />)

    screen.getByRole('button', { name: 'Completar' }).click()
    await vi.waitFor(() => expect(onResuelto).toHaveBeenCalledTimes(1))

    expect(supabaseClient.rpc).toHaveBeenCalledWith('resolver_revision_ia', {
      p_interaccion_id: 'int-1',
      p_estado_final: 'completada',
      p_detalle_sanitizado: { resuelto_desde: 'refine' },
    })
  })

  it('muestra el error y no avisa onResuelto cuando el RPC falla', async () => {
    vi.mocked(supabaseClient.rpc).mockResolvedValue({ data: null, error: { message: 'boom' } } as never)
    const onResuelto = vi.fn()
    render(<AccionesResolucionInteraccionIA interaccionId="int-1" estado="revision_humana" onResuelto={onResuelto} />)

    screen.getByRole('button', { name: 'Rechazar' }).click()
    await vi.waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument())

    expect(onResuelto).not.toHaveBeenCalled()
  })

  it('anuncia el error dinámicamente para lectores de pantalla (aria-live)', async () => {
    vi.mocked(supabaseClient.rpc).mockResolvedValue({ data: null, error: { message: 'boom' } } as never)
    render(<AccionesResolucionInteraccionIA interaccionId="int-1" estado="revision_humana" onResuelto={vi.fn()} />)

    screen.getByRole('button', { name: 'Rechazar' }).click()

    expect(await screen.findByRole('status')).toHaveTextContent('boom')
  })

})
