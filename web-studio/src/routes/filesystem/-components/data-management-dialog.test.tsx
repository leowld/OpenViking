// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, expect, it, vi } from 'vitest'

import { DataManagementDialog } from './data-management-dialog'
import { importOvpack } from '../-lib/data-management'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('sonner', () => ({
  toast: { loading: vi.fn(() => 1), success: vi.fn(), error: vi.fn() },
}))

vi.mock('../-lib/data-management', () => ({
  createDataManagementClient: () => ({ client: {} }),
  exportOvpack: vi.fn(),
  importOvpack: vi.fn(),
  listSnapshots: vi.fn(),
}))

afterEach(cleanup)

it('closes immediately and refreshes the directory only after a successful import', async () => {
  let completeImport!: (value: { uri: string }) => void
  vi.mocked(importOvpack).mockReturnValueOnce(
    new Promise((resolve) => {
      completeImport = resolve
    }),
  )
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

  expect(onClose).toHaveBeenCalledOnce()
  expect(onChanged).not.toHaveBeenCalled()
  expect(toast.loading).toHaveBeenCalledWith('importing')

  completeImport({ uri: 'viking://resources/project/' })
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
  expect(toast.success).toHaveBeenCalledWith('imported', { id: 1 })
})

it('closes immediately and reports an import error without refreshing the directory', async () => {
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

  expect(onClose).toHaveBeenCalledOnce()
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith('Import failed', { id: 1 }),
  )
  expect(onChanged).not.toHaveBeenCalled()
})

it('continues importing after the dialog unmounts', async () => {
  let completeImport!: (value: { uri: string }) => void
  vi.mocked(importOvpack).mockReturnValueOnce(
    new Promise((resolve) => {
      completeImport = resolve
    }),
  )
  const user = userEvent.setup()
  const onChanged = vi.fn()
  const onClose = vi.fn()
  const view = render(
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

  expect(onClose).toHaveBeenCalledOnce()
  view.unmount()
  completeImport({ uri: 'viking://resources/project/' })
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
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
