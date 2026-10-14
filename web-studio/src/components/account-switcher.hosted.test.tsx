// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { AccountSwitcher } from './account-switcher'

const { activateProfile } = vi.hoisted(() => ({ activateProfile: vi.fn() }))

vi.mock('#/hooks/use-studio-service', () => ({
  useStudioService: () => ({ provider: 'volcengine' }),
}))
vi.mock('#/hooks/use-app-connection', () => ({
  useAppConnection: () => ({
    connection: {
      accountId: 'study',
      userId: 'default',
      apiKey: 'study-key',
      adminApiKey: '',
      baseUrl: 'https://hosted.example/openviking',
      serviceSelection: 'volcengine',
    },
    profiles: [
      {
        id: 'study-copy',
        name: 'Study copy',
        connection: {
          accountId: 'study',
          apiKey: 'older-study-key',
          baseUrl: 'https://hosted.example/openviking',
          serviceSelection: 'volcengine',
        },
      },
      {
        id: 'study',
        name: 'Study',
        connection: {
          accountId: 'study',
          apiKey: 'study-key',
          baseUrl: 'https://hosted.example/openviking',
          serviceSelection: 'volcengine',
        },
      },
      {
        id: 'default',
        name: 'Default',
        connection: {
          accountId: 'default',
          apiKey: 'default-key',
          baseUrl: 'https://hosted.example/openviking',
          serviceSelection: 'volcengine',
        },
      },
      {
        id: 'unconfigured',
        name: 'Unconfigured',
        connection: {
          accountId: 'other',
          apiKey: '',
          baseUrl: 'https://hosted.example/openviking',
          serviceSelection: 'volcengine',
        },
      },
    ],
    activeProfileId: 'study',
    activateProfile,
    connectionRole: 'user',
    isConnectionRoleLoading: false,
    isGatewayHost: false,
    serverMode: 'api_key',
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: React.PropsWithChildren<{ to: string }>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(() => {
  cleanup()
  activateProfile.mockClear()
})

it('switches only among configured hosted connections', async () => {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <AccountSwitcher />
    </QueryClientProvider>,
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'hosted.switchWorkspace' }),
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /default/ })).toBeTruthy(),
  )
  expect(screen.getAllByRole('button', { name: /study/ })).toHaveLength(1)
  expect(
    screen.getByRole('button', { name: /study/ }).getAttribute('aria-current'),
  ).toBe('true')
  expect(screen.queryByText('other')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /default/ }))
  expect(activateProfile).toHaveBeenCalledWith('default')
  client.clear()
})
