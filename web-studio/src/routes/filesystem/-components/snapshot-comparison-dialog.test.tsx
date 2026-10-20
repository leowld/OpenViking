// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { SnapshotComparisonDialog } from './snapshot-comparison-dialog'

const mocks = vi.hoisted(() => ({
  diffSnapshot: vi.fn(),
  listSnapshots: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../-lib/data-management', () => ({
  createDataManagementClient: () => ({}),
  diffSnapshot: mocks.diffSnapshot,
  listSnapshots: mocks.listSnapshots,
}))

vi.mock('./snapshot-diff-viewer', () => ({
  SnapshotDiffViewer: ({ diff }: { diff: string }) => <div>{diff}</div>,
}))

it('compares on selection and ignores a stale response', async () => {
  mocks.listSnapshots.mockResolvedValue([
    { oid: 'new', message: 'New' },
    { oid: 'old', message: 'Old' },
  ])
  const pending: Array<(value: string) => void> = []
  mocks.diffSnapshot.mockImplementation(
    () => new Promise<string>((resolve) => pending.push(resolve)),
  )

  render(
    <SnapshotComparisonDialog
      onClose={vi.fn()}
      uri="viking://resources/note.md"
    />,
  )
  await waitFor(() => expect(mocks.diffSnapshot).toHaveBeenCalledTimes(1))
  expect(mocks.diffSnapshot.mock.calls[0][2]).toBe('new')
  expect(mocks.diffSnapshot.mock.calls[0][3]).toBe('old')

  fireEvent.change(screen.getByLabelText('previousVersion'), {
    target: { value: '' },
  })
  await waitFor(() => expect(mocks.diffSnapshot).toHaveBeenCalledTimes(2))
  expect(mocks.diffSnapshot.mock.calls[1][3]).toBeUndefined()

  await act(async () => pending[1]('current comparison'))
  await act(async () => pending[0]('stale comparison'))
  expect(screen.getByText('current comparison')).toBeTruthy()
  expect(screen.queryByText('stale comparison')).toBeNull()
})
