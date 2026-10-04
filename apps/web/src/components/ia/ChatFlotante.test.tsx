import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { panelFixtures } from '../../test/fixtures/panel'

const mocks = vi.hoisted(() => ({ useContextoPanel: vi.fn(), rpc: vi.fn() }))
vi.mock('../../hooks/useContextoPanel', () => ({ useContextoPanel: mocks.useContextoPanel }))
vi.mock('../../lib/supabase', () => ({ supabaseClient: { rpc: mocks.rpc } }))

import { ChatFlotante } from './ChatFlotante'

// El companion flotante (pedido 2026-10-04: acompaña cualquier pantalla,
// no solo /ia/chat) no muestra nada sin organización activa o sin el
// feature habilitado — mismo chequeo que la pantalla dedicada, pero acá
// decide si el disparador (el FAB) aparece siquiera.
describe('ChatFlotante', () => {
  it('no muestra el botón sin organización activa', () => {
    mocks.useContextoPanel.mockReturnValue({ contexto: panelFixtures.superadmin })

    const { container } = render(<ChatFlotante />)

    expect(container).toBeEmptyDOMElement()
  })

  it('no muestra el botón si chat-ia no está habilitado para la organización', async () => {
    mocks.useContextoPanel.mockReturnValue({ contexto: panelFixtures.miembro })
    mocks.rpc.mockResolvedValue({ data: false, error: null })

    const { container } = render(<ChatFlotante />)

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('tiene_feature_publica', { p_feature_id: 'chat-ia' }))
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra el botón flotante cuando chat-ia está habilitado', async () => {
    mocks.useContextoPanel.mockReturnValue({ contexto: panelFixtures.miembro })
    mocks.rpc.mockResolvedValue({ data: true, error: null })

    render(<ChatFlotante />)

    expect(await screen.findByRole('button', { name: 'Abrir Chat IA' })).toBeInTheDocument()
  })

  it('no explota si la consulta de feature flag falla', async () => {
    mocks.useContextoPanel.mockReturnValue({ contexto: panelFixtures.miembro })
    mocks.rpc.mockRejectedValue(new Error('red caída'))

    const { container } = render(<ChatFlotante />)

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
