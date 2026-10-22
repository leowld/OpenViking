// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type * as CompileApi from '#/routes/compile/-lib/api'
import { CompileTaskResult } from './terminal-panel'

const api = vi.hoisted(() => ({ fetchCompileTask: vi.fn() }))
vi.mock('#/routes/compile/-lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof CompileApi>()),
  fetchCompileTask: api.fetchCompileTask,
}))
vi.mock('#/hooks/use-app-connection', () => ({
  useAppConnection: () => ({ identityScopeKey: 'connection-a' }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { index?: number }) =>
      options?.index ? `${key} ${options.index}` : key,
  }),
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

it('refreshes explorer data and opens the output URI after compilation completes', async () => {
  api.fetchCompileTask.mockResolvedValue({
    task_id: 'cmp-1',
    status: 'completed',
    resource_id: 'viking://resources/input-a, viking://resources/input-b',
    meta: {
      request: {
        from: ['viking://resources/input-a', 'viking://resources/input-b'],
        to: 'viking://resources/output',
        skill: 'viking://agent/skills/demo',
      },
    },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const onOpenResource = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <CompileTaskResult taskId="cmp-1" onOpenResource={onOpenResource} />
    </QueryClientProvider>,
  )

  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: 'viking://resources/output' }),
    ).not.toBeNull()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['viking-fs'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['viking-file-read'] })
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'viking://resources/output' }),
  )
  expect(onOpenResource).toHaveBeenCalledWith('viking://resources/output')
  expect(
    screen
      .getByText('viking://resources/input-a, viking://resources/input-b')
      .closest('button'),
  ).toBeNull()
  fireEvent.click(
    screen.getByRole('button', { name: 'viking://resources/input-b' }),
  )
  expect(onOpenResource).toHaveBeenCalledWith('viking://resources/input-b')
  client.clear()
})
