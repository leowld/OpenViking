import { useRef, useState } from 'react';
import type { OvClient, OvRequestOptions } from '../../client/types.js';
import type { FileBrowserHandle } from './types.js';
import { scopeKeyOf, type RequestScope } from './fs-scope.js';
import { toError } from './fs-model.js';
import { useRequestScope } from './use-request-scope.js';

export function useSearchNavigation({
  client,
  rootUri,
  requestOptions,
  onOpenResource,
  onSuccess,
}: {
  client: OvClient | null;
  rootUri: string;
  requestOptions?: OvRequestOptions;
  onOpenResource: FileBrowserHandle['openResource'];
  onSuccess: () => void;
}) {
  const scope = useRequestScope(client, requestOptions, rootUri);
  const active = useRef<object | null>(null);
  const [state, setState] = useState<{
    scope: RequestScope;
    uri: string;
    pending: boolean;
    error?: Error;
  }>();
  const current =
    state?.scope.key === scopeKeyOf(client, requestOptions, rootUri)
      ? state
      : undefined;
  const open = (uri: string) => {
    const owner = scope.current();
    const request = {};
    active.current = request;
    setState({ scope: owner, uri, pending: true });
    const valid = () =>
      active.current === request &&
      scope.current() === owner &&
      !owner.controller.signal.aborted;
    void onOpenResource(uri).then(
      () => {
        if (!valid()) return;
        active.current = null;
        onSuccess();
      },
      (cause: unknown) => {
        if (!valid()) return;
        active.current = null;
        setState({ scope: owner, uri, pending: false, error: toError(cause) });
      },
    );
  };
  return {
    open,
    pending: current?.pending ?? false,
    error: current?.error ?? null,
    retry: () => {
      if (current?.error) open(current.uri);
    },
    reset: () => {
      active.current = null;
      setState(undefined);
    },
  };
}
