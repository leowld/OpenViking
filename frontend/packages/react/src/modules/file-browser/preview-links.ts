import type {
  FilePreviewDirectoryTab,
  FilePreviewFileTab,
} from '../../components/file-preview/index.js';

/** Resolve preview resource links against the current directory or file. */
export async function openPreviewLink(
  tab: FilePreviewDirectoryTab | FilePreviewFileTab,
  target: string,
  openResource: (uri: string) => Promise<boolean>,
): Promise<void> {
  if (!target.trim()) return;
  const uri = tab.kind === 'directory' ? tab.key : tab.source.path;
  if (!uri?.startsWith('viking://')) return;
  const pathStart = uri.indexOf('/', 'viking://'.length);
  const origin = pathStart < 0 ? uri : uri.slice(0, pathStart);
  const path = pathStart < 0 ? '' : uri.slice(pathStart);
  // Storage paths are literal: escape each segment before URL parsing so `#`,
  // `?` and `%` in directory names cannot become URL syntax or escape sequences.
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const base =
    tab.kind === 'directory'
      ? `${origin}${encodedPath.replace(/\/$/, '')}/`
      : `${origin}${encodedPath}`;
  let destination: string;
  try {
    const url = new URL(target, base);
    if (url.protocol !== 'viking:') return;
    destination = `viking://${url.host}${decodeURIComponent(url.pathname)}`;
  } catch {
    return;
  }
  await openResource(destination);
}
