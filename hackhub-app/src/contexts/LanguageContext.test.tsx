import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider, useLanguage } from './LanguageContext'
import { translateUiText } from './uiTranslations'

function TestContent() {
  const { language, toggleLanguage } = useLanguage()

  return (
    <div>
      <button onClick={toggleLanguage}>{language}</button>
      <span>Hackathons</span>
      <span>12 participants</span>
      <input placeholder="Search hackathons..." />
    </div>
  )
}

describe('LanguageProvider', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('does not observe or traverse the DOM in fixed English mode', () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe')
    const walk = vi.spyOn(document, 'createTreeWalker')
    try {
      const { rerender } = render(<LanguageProvider><TestContent /></LanguageProvider>)
      rerender(<LanguageProvider><TestContent /><span>New nomination</span></LanguageProvider>)
      expect(screen.getByText('New nomination')).toBeInTheDocument()
      expect(observe).not.toHaveBeenCalled()
      // React itself may walk the tree; the removed translator used SHOW_TEXT.
      expect(walk.mock.calls.some(([, filter]) => filter === NodeFilter.SHOW_TEXT)).toBe(false)
    } finally {
      observe.mockRestore()
      walk.mockRestore()
    }
  })

  it('keeps English when a language toggle is requested', () => {
    render(
      <LanguageProvider>
        <TestContent />
      </LanguageProvider>,
    )

    expect(screen.getByText('Hackathons')).toBeInTheDocument()
    expect(screen.getByText('12 participants')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search hackathons...')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'en' }))

    expect(screen.getByText('Hackathons')).toBeInTheDocument()
    expect(screen.getByText('12 participants')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search hackathons...')).toBeInTheDocument()
  })

  it('preserves requested English copy and attributes inside translate=no', () => {
    render(
      <LanguageProvider>
        <div translate="no">
          <span>Tags you want to add</span>
          <textarea placeholder="In 3–5 sentences, summarize your key contributions over the past year and explain why you represent the spirit of a Digital Pioneer." />
        </div>
        <TestContent />
      </LanguageProvider>,
    )
    expect(screen.getByText('Tags you want to add')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/^In 3–5 sentences/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'en' }))
    fireEvent.click(screen.getByRole('button', { name: 'en' }))
    expect(screen.getByPlaceholderText(/^In 3–5 sentences/)).toBeInTheDocument()
  })

  it('leaves user content without a known UI translation unchanged', () => {
    expect(translateUiText("Alice's Custom Hackathon")).toBe("Alice's Custom Hackathon")
    expect(translateUiText('Spring 2026 Hackathon')).toBe('2026 数字先锋奖')
  })
})
