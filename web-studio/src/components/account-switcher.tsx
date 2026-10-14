import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2Icon,
  CheckIcon,
  ChevronDownIcon,
  CodeXmlIcon,
  LoaderCircleIcon,
  PlusIcon,
  SearchIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { useStudioService } from '#/hooks/use-studio-service'
import { useAppConnection } from '#/hooks/use-app-connection'
import {
  createAdminAccount,
  fetchAdminAccounts,
  fetchAdminUsers,
} from '#/lib/admin'
import type {
  AdminConnection,
  AdminUser,
  CreateAccountInput,
} from '#/lib/admin'
import { DEFAULT_USER_ID } from '#/lib/admin-options'
import { PLAIN_INPUT_PROPS } from '#/lib/form-input'
import { resolveStudioManagementCapabilities } from '#/lib/studio-permissions'
import { cn } from '#/lib/utils'

export function selectAccountUser(
  users: readonly AdminUser[],
  _currentUserId: string,
  requireApiKey: boolean,
): AdminUser | undefined {
  const candidates = requireApiKey
    ? users.filter((user) => Boolean(user.apiKey))
    : [...users]
  return candidates[0]
}

function ServiceIcon({ hosted }: { hosted: boolean }) {
  const { t } = useTranslation('accountSwitcher')
  const label = t(`provider.${hosted ? 'hosted' : 'opensource'}`)
  return (
    <span
      title={label}
      role="img"
      aria-label={label}
      className="inline-flex size-4 shrink-0 items-center justify-center text-sidebar-foreground/70"
    >
      {hosted ? (
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 opacity-60"
          aria-hidden="true"
        >
          <g transform="translate(0.349 12.857)">
            <path
              d="M0 9.1584H6.34404L3.4718 0.221463C3.41951 0.0533704 3.23825 -0.0376799 3.07094 0.0148491C2.97333 0.0463665 2.89665 0.123409 2.86528 0.221463L0 9.1584Z"
              fill="#00DCFF"
            />
          </g>
          <g transform="translate(15.771 11.277)">
            <path
              d="M0 10.7483H7.36188L3.9842 0.221463C3.93191 0.0533704 3.75065 -0.03768 3.58334 0.0148491C3.48574 0.0463665 3.40905 0.123409 3.37768 0.221463L0 10.7483Z"
              fill="#00DCFF"
            />
          </g>
          <g transform="translate(7.012 1.716)">
            <path
              d="M0 20.3102H13.5804L7.09348 0.219641C7.03771 0.0515485 6.85993 -0.0395018 6.69262 0.0165291C6.59502 0.0480465 6.51833 0.125089 6.48696 0.219641L0 20.3102Z"
              fill="#006AFF"
            />
          </g>
          <g transform="translate(2.882 6.815)">
            <path
              d="M0.00348549 15.2114H10.2829L5.44472 0.219641C5.38895 0.0515482 5.21118 -0.0395018 5.04386 0.0165292C4.94626 0.0480466 4.86958 0.125089 4.83821 0.219641L0 15.2114H0.00348549Z"
              fill="#006AFF"
            />
          </g>
          <g transform="translate(5.736 9.355)">
            <path
              d="M0 12.6725H8.69343L4.64998 0.219641C4.5942 0.0515485 4.41643 -0.0395018 4.24912 0.0165291C4.15152 0.0480465 4.07832 0.125089 4.04694 0.219641L0.00348582 12.6725H0Z"
              fill="#00DCFF"
            />
          </g>
        </svg>
      ) : (
        <CodeXmlIcon className="size-4" strokeWidth={1.8} aria-hidden="true" />
      )}
    </span>
  )
}

export function AccountSwitcher() {
  const { t } = useTranslation('accountSwitcher')
  const queryClient = useQueryClient()
  const {
    connection,
    profiles,
    activeProfileId,
    activateProfile,
    connectionRole,
    isConnectionRoleLoading,
    isGatewayHost,
    setGeneratedCredential,
    serverMode,
    switchIdentity,
    switchManagementAccount,
  } = useAppConnection()
  const [open, setOpen] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [switchingAccountId, setSwitchingAccountId] = React.useState('')
  const [manualSwitch, setManualSwitch] = React.useState<{
    accountId: string
    apiKey: string
    userId: string
  } | null>(null)
  const [createDraft, setCreateDraft] = React.useState<CreateAccountInput>({
    accountId: '',
    adminUserId: DEFAULT_USER_ID,
  })

  const { provider } = useStudioService()
  const capabilities = resolveStudioManagementCapabilities({
    serviceProvider: provider,
    hasControlCredential: Boolean(connection.adminApiKey.trim()),
    isRoleLoading: isConnectionRoleLoading,
    role: connectionRole,
    serverMode,
  })

  const canManageAccounts = isGatewayHost
    ? connectionRole === 'root' && !isConnectionRoleLoading
    : capabilities.canManageAccounts

  const adminConnection = React.useMemo<AdminConnection>(
    () => ({
      accountId: connection.accountId,
      apiKey:
        connection.adminApiKey || (isGatewayHost ? connection.apiKey : ''),
      baseUrl: connection.baseUrl,
      userId: connection.userId,
    }),
    [
      connection.accountId,
      connection.adminApiKey,
      connection.apiKey,
      isGatewayHost,
      connection.baseUrl,
      connection.userId,
    ],
  )

  const accountsQuery = useQuery({
    enabled: canManageAccounts && open,
    queryFn: () => fetchAdminAccounts(adminConnection),
    queryKey: [
      'account-switcher',
      adminConnection.baseUrl,
      adminConnection.apiKey,
    ],
    retry: false,
  })

  const filteredAccounts = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const accounts = accountsQuery.data ?? []
    if (!normalizedSearch) {
      return accounts
    }
    return accounts.filter((account) =>
      account.accountId.toLowerCase().includes(normalizedSearch),
    )
  }, [accountsQuery.data, search])

  async function selectAccount(accountId: string): Promise<void> {
    if (accountId === connection.accountId) {
      setOpen(false)
      return
    }

    setSwitchingAccountId(accountId)
    try {
      if (isGatewayHost) {
        await switchManagementAccount(accountId)
        setOpen(false)
        toast.success(t('toast.switched', { account: accountId }))
        return
      }
      const users = await fetchAdminUsers(adminConnection, accountId)
      const firstUser = selectAccountUser(users, connection.userId, false)
      if (!firstUser) {
        throw new Error(t('errors.noUsers'))
      }

      const candidates =
        serverMode === 'api_key'
          ? users.filter((user) => Boolean(user.apiKey))
          : [firstUser]
      let switchError: unknown
      for (const user of candidates) {
        try {
          await switchIdentity({
            accountId,
            allowLegacyIdentityFallback: true,
            apiKey: user.apiKey || '',
            userId: user.userId,
          })
          setOpen(false)
          toast.success(
            t('toast.switched', {
              account: accountId,
            }),
          )
          return
        } catch (error) {
          switchError = error
        }
      }

      if (serverMode === 'api_key') {
        setOpen(false)
        setManualSwitch({
          accountId,
          apiKey: '',
          userId: firstUser.userId,
        })
        return
      }
      throw switchError
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSwitchingAccountId('')
    }
  }

  const createAccount = useMutation({
    mutationFn: (input: CreateAccountInput) =>
      createAdminAccount(adminConnection, input),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : String(error)),
    onSuccess: async (result, input) => {
      const accountId = result.accountId || input.accountId
      const userId = result.userId || input.adminUserId
      if (result.apiKey) {
        setGeneratedCredential({
          accountId,
          apiKey: result.apiKey,
          userId,
        })
      }
      setCreateOpen(false)
      setOpen(false)
      setCreateDraft({ accountId: '', adminUserId: DEFAULT_USER_ID })
      void queryClient.invalidateQueries({ queryKey: ['account-switcher'] })

      if (!result.apiKey && serverMode === 'api_key') {
        await switchManagementAccount(accountId)
        toast.warning(t('errors.noCreatedKey'))
        return
      }

      try {
        await switchIdentity({
          accountId,
          allowLegacyIdentityFallback: true,
          apiKey: result.apiKey,
          userId,
        })
        toast.success(t('toast.created', { account: input.accountId }))
      } catch (error) {
        await switchManagementAccount(accountId)
        toast.error(
          t('toast.createdSwitchFailed', {
            account: input.accountId,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      }
    },
  })

  const accountLabel = connection.accountId || t('unset')

  if (provider === 'volcengine') {
    const seenWorkspaces = new Set<string>()
    const libraryProfiles = [...profiles]
      .filter(
        (profile) =>
          profile.connection.serviceSelection === 'volcengine' &&
          profile.connection.baseUrl.replace(/\/+$/, '') ===
            connection.baseUrl.replace(/\/+$/, '') &&
          Boolean(profile.connection.apiKey),
      )
      .sort((a, b) =>
        a.id === activeProfileId ? -1 : b.id === activeProfileId ? 1 : 0,
      )
      .filter((profile) => {
        const workspace = profile.connection.accountId || profile.name
        if (seenWorkspaces.has(workspace)) return false
        seenWorkspaces.add(workspace)
        return true
      })

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label={t('hosted.switchWorkspace')}
          className="flex h-10 w-full min-w-0 items-center gap-2 rounded-lg px-1 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent/50">
            <Building2Icon className="size-4" />
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <span className="min-w-0 truncate text-sm font-semibold">
              {connection.accountId || t('hosted.currentWorkspace')}
            </span>
            <ServiceIcon hosted />
          </span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={6}
          className="w-64 gap-0 p-1.5"
        >
          <div className="max-h-60 space-y-0.5 overflow-y-auto">
            {libraryProfiles.map((profile) => {
              const active = profile.id === activeProfileId
              return (
                <button
                  key={profile.id}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => {
                    setOpen(false)
                    activateProfile(profile.id)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active && 'bg-accent/70',
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-xs font-semibold">
                    {(profile.connection.accountId || profile.name)
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {profile.connection.accountId || profile.name}
                    </span>
                    <ServiceIcon hosted />
                  </span>
                  {active ? <CheckIcon className="size-3.5 shrink-0" /> : null}
                </button>
              )
            })}
          </div>
          <p className="border-t px-2.5 py-2 text-xs text-muted-foreground">
            {t('hosted.configuredOnly')}
          </p>
          <Link
            to="/config"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PlusIcon className="size-4" />
            {t('hosted.addWorkspace')}
          </Link>
        </PopoverContent>
      </Popover>
    )
  }

  if (!canManageAccounts) {
    return (
      <div
        className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        title={accountLabel}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent/50">
          <Building2Icon className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1 group-data-[collapsible=icon]:hidden">
          <span className="min-w-0 truncate text-sm font-semibold">
            {accountLabel}
          </span>
          {provider === 'opensource' ? <ServiceIcon hosted={false} /> : null}
        </span>
      </div>
    )
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="flex h-10 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent/50">
            <Building2Icon className="size-4" />
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1 group-data-[collapsible=icon]:hidden">
            <span className="min-w-0 truncate text-sm font-semibold">
              {accountLabel}
            </span>
            {provider === 'opensource' ? <ServiceIcon hosted={false} /> : null}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={6}
          className="w-64 gap-0 p-0"
        >
          <div className="border-b p-2">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('searchPlaceholder')}
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1.5">
            {accountsQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 px-2.5 py-6 text-sm text-muted-foreground">
                <LoaderCircleIcon className="size-3.5 animate-spin" />
                {t('loading')}
              </div>
            ) : accountsQuery.isError ? (
              <div className="grid gap-1 px-2.5 py-5 text-center">
                <p className="text-sm font-medium text-destructive">
                  {t('errors.loadAccounts')}
                </p>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {accountsQuery.error instanceof Error
                    ? accountsQuery.error.message
                    : String(accountsQuery.error)}
                </p>
              </div>
            ) : filteredAccounts.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">
                {t('empty')}
              </p>
            ) : (
              filteredAccounts.map((account) => {
                const active = account.accountId === connection.accountId
                const switching = switchingAccountId === account.accountId
                return (
                  <button
                    key={account.accountId}
                    type="button"
                    disabled={Boolean(switchingAccountId)}
                    onClick={() => void selectAccount(account.accountId)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent disabled:cursor-wait disabled:opacity-60',
                      active && 'bg-accent/70',
                    )}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background">
                      <Building2Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="min-w-0 truncate text-sm font-medium">
                          {account.accountId}
                        </span>
                        <ServiceIcon hosted={false} />
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t('memberCount', { count: account.userCount })}
                      </span>
                    </span>
                    {switching ? (
                      <LoaderCircleIcon className="size-3.5 animate-spin" />
                    ) : active ? (
                      <CheckIcon className="size-3.5 text-primary" />
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
          {!isGatewayHost && (
            <div className="border-t p-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start px-2.5"
                onClick={() => {
                  setOpen(false)
                  setCreateOpen(true)
                }}
              >
                <PlusIcon />
                {t('create')}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <Dialog
        open={Boolean(manualSwitch)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !switchingAccountId) {
            setManualSwitch(null)
          }
        }}
      >
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (!manualSwitch?.apiKey.trim()) {
                return
              }
              const target = manualSwitch
              setSwitchingAccountId(target.accountId)
              void switchIdentity({
                accountId: target.accountId,
                apiKey: target.apiKey,
                userId: target.userId,
              })
                .then(() => {
                  toast.success(
                    t('toast.switched', { account: target.accountId }),
                  )
                  setManualSwitch(null)
                })
                .catch((error: unknown) => {
                  toast.error(
                    error instanceof Error ? error.message : String(error),
                  )
                })
                .finally(() => setSwitchingAccountId(''))
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('manualSwitch.title')}</DialogTitle>
              <DialogDescription>
                {t('manualSwitch.description', {
                  account: manualSwitch?.accountId,
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-5">
              <label className="grid gap-2 text-sm font-medium">
                {t('manualSwitch.keyLabel')}
                <Input
                  required
                  type="password"
                  value={manualSwitch?.apiKey ?? ''}
                  onChange={(event) =>
                    setManualSwitch((current) =>
                      current
                        ? { ...current, apiKey: event.target.value }
                        : current,
                    )
                  }
                  placeholder={t('manualSwitch.keyPlaceholder')}
                  {...PLAIN_INPUT_PROPS}
                />
              </label>
              <p className="text-xs leading-5 text-muted-foreground">
                {t('manualSwitch.hint')}
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(switchingAccountId)}
                onClick={() => {
                  const targetAccountId = manualSwitch?.accountId
                  if (!targetAccountId) {
                    return
                  }
                  setSwitchingAccountId(targetAccountId)
                  void switchManagementAccount(targetAccountId)
                    .then(() => {
                      setManualSwitch(null)
                      toast.success(
                        t('toast.managementSwitched', {
                          account: targetAccountId,
                        }),
                      )
                    })
                    .catch((error: unknown) => {
                      toast.error(
                        error instanceof Error ? error.message : String(error),
                      )
                    })
                    .finally(() => setSwitchingAccountId(''))
                }}
              >
                {t('manualSwitch.manageOnly')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={Boolean(switchingAccountId)}
                onClick={() => setManualSwitch(null)}
              >
                {t('dialog.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={
                  Boolean(switchingAccountId) || !manualSwitch?.apiKey.trim()
                }
              >
                {switchingAccountId ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <CheckIcon />
                )}
                {t('manualSwitch.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              createAccount.mutate(createDraft)
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('dialog.title')}</DialogTitle>
              <DialogDescription>{t('dialog.description')}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-5">
              <label className="grid gap-2 text-sm font-medium">
                {t('dialog.accountLabel')}
                <Input
                  required
                  value={createDraft.accountId}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      accountId: event.target.value,
                    }))
                  }
                  placeholder={t('dialog.accountPlaceholder')}
                  {...PLAIN_INPUT_PROPS}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                {t('dialog.adminLabel')}
                <Input
                  required
                  value={createDraft.adminUserId}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      adminUserId: event.target.value,
                    }))
                  }
                  placeholder={DEFAULT_USER_ID}
                  {...PLAIN_INPUT_PROPS}
                />
              </label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                {t('dialog.cancel')}
              </Button>
              <Button type="submit" disabled={createAccount.isPending}>
                {createAccount.isPending ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <PlusIcon />
                )}
                {t('dialog.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
