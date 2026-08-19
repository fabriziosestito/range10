import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the page tabs starting on Data', () => {
    render(<App />)
    expect(screen.getByRole('tab', { name: 'Data' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Session' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'View' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Data' })).toHaveAttribute('aria-selected', 'true')
  })

  it('navigates between pages with the tabs', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: 'Session' }))
    expect(screen.getByRole('tab', { name: 'Session' })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('tab', { name: 'View' }))
    expect(screen.getByText('Shot view is coming soon')).toBeInTheDocument()
  })

  it('shows placeholder metric tiles before the first shot', () => {
    render(<App />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(10)
    expect(screen.getByText('Carry Distance')).toBeInTheDocument()
    expect(screen.getByText('Club Speed')).toBeInTheDocument()
  })

  it('groups all settings in the settings drawer', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Open settings' }))
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
    await user.click(screen.getByRole('button', { name: 'Open settings' }))
    expect(screen.getByText('2.3 yd')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Increase tee distance' }))
    expect(screen.getByText('2.4 yd')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Decrease tee distance' }))
    await user.click(screen.getByRole('button', { name: 'Decrease tee distance' }))
    expect(screen.getByText('2.2 yd')).toBeInTheDocument()
  })
})
