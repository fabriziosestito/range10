import { render, screen, within } from '@testing-library/react'
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
    expect(screen.getByRole('combobox', { name: 'View mode' })).toHaveValue('3d')
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
    expect(screen.getByText('7 ft')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Increase tee distance' }))
    expect(screen.getByText('8 ft')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Decrease tee distance' }))
    await user.click(screen.getByRole('button', { name: 'Decrease tee distance' }))
    expect(screen.getByText('6 ft')).toBeInTheDocument()
  })

  it('shows the dispersion map with a carry/total toggle when shots exist', async () => {
    const user = userEvent.setup()
    render(<App />)
    // Create a shot via the browser-mode mock
    window.dispatchEvent(new CustomEvent('range:shot', { detail: { id: 1, clubSpeed: 90, path: 0, face: 0, attack: 0, tempo: 0, backswingTime: 0, downswingTime: 0, launch: 15, ballSpeed: 130, spin: 2000, carry: 150, total: 160, launchDirection: 0, spinAxis: 0, backspin: 2000, sidespin: 0, apex: 20, timeOfFlight: 5, offline: 2, carryOffline: 1.5, carryDeviationDeg: 0.5, totalDeviationDeg: 0.6 } }))
    await user.click(screen.getByRole('tab', { name: 'View' }))
    // Switch to 2D map before asserting — the 3D view lazy-loads FUSE which
    // requires WebGL and cannot render in jsdom.
    await user.selectOptions(screen.getByRole('combobox', { name: 'View mode' }), 'map')
    expect(screen.getByLabelText('Dispersion mode')).toBeInTheDocument()
    expect(screen.getByText('Carry')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getAllByText('Driver').length).toBeGreaterThan(0)
    expect(screen.queryByText('Drive')).not.toBeInTheDocument()
    const map = screen.getByLabelText('Dispersion map')
    expect(within(map).getByText('50 yd')).toBeInTheDocument()
    expect(within(map).getByText('60 yd')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'View mode' })).toHaveValue('map')

    expect(screen.getByRole('combobox', { name: 'Map scale' })).toHaveValue('auto')
    await user.click(screen.getByRole('combobox', { name: 'Map scale' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Map scale' }), '150')
    expect(screen.getByRole('combobox', { name: 'Map scale' })).toHaveValue('150')

    await user.click(screen.getByRole('button', { name: 'Open settings' }))
    await user.click(screen.getByRole('radio', { name: 'Metric' }))
    expect(within(map).getByText('50 m')).toBeInTheDocument()
    expect(within(map).getByText('60 m')).toBeInTheDocument()
    expect(within(map).getByText('100 m')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Map scale' })).toHaveValue('150')
    expect(map.querySelector('title')?.textContent).toContain('137 m')
  })
})
