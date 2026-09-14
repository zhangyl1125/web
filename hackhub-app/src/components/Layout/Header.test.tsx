import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { Header } from './Header'
import { LanguageProvider } from '../../contexts/LanguageContext'

// Mock authStore
vi.mock('../../store/authStore', () => ({
  useAuthStore: vi.fn(),
}))

import { useAuthStore } from '../../store/authStore'
const mockUseAuthStore = useAuthStore as unknown as ReturnType<typeof vi.fn>

function CurrentPath() {
  return <output data-testid="current-path">{useLocation().pathname + useLocation().search}</output>
}

function renderHeader(props?: { opened?: boolean; toggle?: () => void }) {
  const toggle = props?.toggle ?? vi.fn()
  const opened = props?.opened ?? false
  return render(
    <MemoryRouter initialEntries={['/overview']}>
      <MantineProvider>
        <LanguageProvider>
          <Header opened={opened} toggle={toggle} />
          <CurrentPath />
        </LanguageProvider>
      </MantineProvider>
    </MemoryRouter>
  )
}

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockUseAuthStore.mockReturnValue({
      user: {
        id: 'user-1',
        email: 'alice@test.com',
        name: 'Alice',
        role: 'participant',
        skills: [],
      },
      logout: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('renders the user name', () => {
    renderHeader()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bosch Digital')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'BOSCH' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bosch Digital home' })).toHaveAttribute('href', '/')
    expect(screen.queryByText('2026 Award')).not.toBeInTheDocument()
  })

  it('keeps the account role in the account menu', async () => {
    renderHeader()
    expect(screen.queryByText('Participant')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Alice' }))
    expect(await screen.findByText('Participant')).toBeInTheDocument()
    expect(screen.getByText('Profile')).toBeInTheDocument()
  })

  it('uses English even with a saved Chinese preference and has no language switch', () => {
    localStorage.setItem('hackhub-language', 'zh')
    renderHeader()
    expect(screen.queryByRole('button', { name: /Switch to Chinese|切换到英文/ })).not.toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
    expect(localStorage.getItem('hackhub-language')).toBe('en')
  })

  it('opens voting records from the account menu', async () => {
    renderHeader()
    fireEvent.click(screen.getByRole('button', { name: 'Alice' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'My voting records' }))
    expect(screen.getByTestId('current-path')).toHaveTextContent('/projects?view=voting-records')
  })

  it('user menu trigger is clickable', () => {
    renderHeader()
    // The UnstyledButton wrapping Avatar + name should be clickable
    const userArea = screen.getByText('Alice')
    const menuTrigger = userArea.closest('button') ?? userArea.parentElement?.closest('button')
    expect(menuTrigger).not.toBeNull()
  })

  it.each([false, true])('returns to the public home after logout, server failure: %s', async (fails) => {
    const logoutMock = fails
      ? vi.fn().mockRejectedValue(new Error('Server unavailable'))
      : vi.fn().mockResolvedValue(undefined)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockUseAuthStore.mockReturnValue({
      user: { id: 'user-1', email: 'alice@test.com', name: 'Alice', role: 'participant', skills: [] },
      logout: logoutMock,
    })
    renderHeader()
    fireEvent.click(screen.getByRole('button', { name: 'Alice' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Logout' }))
    await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent(/^\/$/))
    expect(logoutMock).toHaveBeenCalledOnce()
    consoleError.mockRestore()
  })

  it('renders with no user gracefully', () => {
    mockUseAuthStore.mockReturnValue({
      user: null,
      logout: vi.fn(),
    })
    expect(() => renderHeader()).not.toThrow()
  })
})
