import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
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
