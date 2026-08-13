import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the navigation tabs in order', () => {
    render(<App />)
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent?.trim())
    expect(tabs).toEqual(['Data', 'Session', 'View', 'Settings'])
  })

  it('shows placeholder stats before the first shot', () => {
    render(<App />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(2)
    expect(screen.getByText('Waiting for your first shot')).toBeInTheDocument()
  })

  it('groups all settings in the settings list', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: /settings/i }))
    expect(screen.getByText('Units')).toBeInTheDocument()
    expect(screen.getByText('Tee distance')).toBeInTheDocument()
    expect(screen.getByText('Voice output')).toBeInTheDocument()
    expect(screen.getByText('Spoken metrics')).toBeInTheDocument()
    expect(screen.getByText('Voice preview')).toBeInTheDocument()
    expect(screen.getByText('Club speed')).toBeInTheDocument()
    expect(screen.getByText('Total spin')).toBeInTheDocument()
  })

  it('adjusts the tee distance with the stepper', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: /settings/i }))
    expect(screen.getByText('2.3 yd')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Increase tee distance' }))
    expect(screen.getByText('2.4 yd')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Decrease tee distance' }))
    await user.click(screen.getByRole('button', { name: 'Decrease tee distance' }))
    expect(screen.getByText('2.2 yd')).toBeInTheDocument()
  })
})