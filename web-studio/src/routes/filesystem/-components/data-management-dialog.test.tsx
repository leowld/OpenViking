// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { DataManagementDialog } from './data-management-dialog'
import { importOvpack } from '../-lib/data-management'

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

it('closes the dialog and refreshes the directory after a successful import', async () => {
  vi.mocked(importOvpack).mockResolvedValueOnce({
    uri: 'viking://resources/project/',
  })
  const user = userEvent.setup()
  const onClose = vi.fn()
  const onChanged = vi.fn()
  render(
    <DataManagementDialog
      mode="transfer"
      uri="viking://resources/project/"
      isDirectory
      onClose={onClose}
      onCompare={vi.fn()}
      onChanged={onChanged}
    />,
  )

  await user.click(screen.getByRole('tab', { name: 'importTab' }))
  await user.upload(
    screen.getByLabelText('chooseFile'),
    new File(['sample'], 'project.ovpack'),
  )
  await user.click(screen.getByRole('button', { name: 'importAction' }))

  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(onChanged).toHaveBeenCalledOnce()
})

it('keeps the dialog open and shows the error when import fails', async () => {
  vi.mocked(importOvpack).mockRejectedValueOnce(new Error('Import failed'))
  const user = userEvent.setup()
  const onClose = vi.fn()
  const onChanged = vi.fn()
  render(
    <DataManagementDialog
      mode="transfer"
      uri="viking://resources/project/"
      isDirectory
      onClose={onClose}
      onCompare={vi.fn()}
      onChanged={onChanged}
    />,
  )

  await user.click(screen.getByRole('tab', { name: 'importTab' }))
  await user.upload(
    screen.getByLabelText('chooseFile'),
    new File(['sample'], 'project.ovpack'),
  )
  await user.click(screen.getByRole('button', { name: 'importAction' }))

  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Import failed',
  )
  expect(onClose).not.toHaveBeenCalled()
  expect(onChanged).not.toHaveBeenCalled()
})

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
