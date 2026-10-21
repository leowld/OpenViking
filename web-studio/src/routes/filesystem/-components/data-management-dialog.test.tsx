// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { DataManagementDialog } from './data-management-dialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../-lib/data-management', () => ({
  createDataManagementClient: () => ({ client: {} }),
  exportOvpack: vi.fn(),
  importOvpack: vi.fn(),
  listSnapshots: vi.fn(),
}))

afterEach(cleanup)

it('keeps the selected OVPack file while switching between import and export', async () => {
  const user = userEvent.setup()
  render(
    <DataManagementDialog
      mode="transfer"
      uri="viking://resources/project/"
      isDirectory
      onClose={vi.fn()}
      onCompare={vi.fn()}
      onChanged={vi.fn()}
    />,
  )

  expect(screen.getByRole('button', { name: 'exportAction' })).toBeTruthy()
  await user.click(screen.getByRole('tab', { name: 'importTab' }))
  const importButton = screen.getByRole('button', { name: 'importAction' })
  expect(importButton.disabled).toBe(true)
  expect(screen.getByText('chooseFile')).toBeTruthy()

  await user.upload(
    screen.getByLabelText('chooseFile'),
    new File(['sample'], 'project.ovpack', { type: 'application/zip' }),
  )
  expect(importButton.disabled).toBe(false)
  expect(screen.getByText('project.ovpack')).toBeTruthy()
  expect(screen.getByText('changeFile')).toBeTruthy()

  await user.click(screen.getByRole('tab', { name: 'exportTab' }))
  await user.click(screen.getByRole('tab', { name: 'importTab' }))
  expect(importButton.disabled).toBe(false)
  expect(screen.getByLabelText('chooseFile')).toHaveProperty(
    'files',
    expect.objectContaining({ length: 1 }),
  )
})
