import { useEffect, useMemo, useRef, useState } from 'react';
import type { DiffLine } from './preview-diff.js';
import type { FileBrowserWorkflowLabels } from './preview-workflow-types.js';

const ROW_HEIGHT = 24;
const OVERSCAN = 6;
const CONTEXT = 3;
type Row =
  | (DiffLine & { index: number })
  | { kind: 'collapsed'; count: number; index: number };

function contextRows(lines: DiffLine[]): Row[] {
  const rows: Row[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index]!;
    if (line.kind !== 'same') {
      rows.push({ ...line, index: index++ });
      continue;
    }
    let end = index + 1;
    while (end < lines.length && lines[end]!.kind === 'same') end++;
    const head = index === 0 ? 0 : CONTEXT;
    const tail = end === lines.length ? 0 : CONTEXT;
    if (end - index <= CONTEXT * 2 + 1) {
      while (index < end) rows.push({ ...lines[index]!, index: index++ });
    } else {
      const hidden = end - tail;
      const first = index + head;
      while (index < first) rows.push({ ...lines[index]!, index: index++ });
      rows.push({ kind: 'collapsed', count: hidden - index, index });
      index = hidden;
      while (index < end) rows.push({ ...lines[index]!, index: index++ });
    }
  }
  return rows;
}

export function PreviewHistoryDiff({
  changes,
  text,
}: {
  changes: DiffLine[];
  text: FileBrowserWorkflowLabels;
}) {
  const list = useRef<HTMLOListElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [viewport, setViewport] = useState({ top: 0, height: 480 });
  const folded = useMemo(() => contextRows(changes), [changes]);
  const rows = useMemo(
    () =>
      expanded ? changes.map((line, index) => ({ ...line, index })) : folded,
    [changes, expanded, folded],
  );
  const canExpand = folded.some((row) => row.kind === 'collapsed');
  // Subscribe to the list's browser layout: its height changes with the host and
  // dialog viewport, independently of events here. Disconnect on unmount.
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const measure = () =>
      setViewport({
        top: element.scrollTop,
        height: element.clientHeight || 480,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const start = Math.min(
    Math.max(0, rows.length - 1),
    Math.max(0, Math.floor(viewport.top / ROW_HEIGHT) - OVERSCAN),
  );
  const end = Math.min(
    rows.length,
    start + Math.ceil(viewport.height / ROW_HEIGHT) + OVERSCAN * 2,
  );
  return (
    <div className="ov-file-history__diff-view">
      {canExpand ? (
        <button
          type="button"
          className="ov-file-history__diff-toggle"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded(!expanded);
            if (list.current) list.current.scrollTop = 0;
            setViewport((previous) => ({ ...previous, top: 0 }));
          }}
        >
          {expanded ? text.hideUnchangedLines : text.showUnchangedLines}
        </button>
      ) : null}
      <ol
        ref={list}
        className="ov-file-history__diff"
        aria-label={text.compareChanges}
        onScroll={(event) => {
          const element = event.currentTarget;
          setViewport({
            top: element.scrollTop,
            height: element.clientHeight || 480,
          });
        }}
      >
        <li
          role="presentation"
          aria-hidden="true"
          className="ov-file-history__diff-spacer"
          style={{ height: start * ROW_HEIGHT }}
        />
        {rows.slice(start, end).map((row, offset) => (
          <li
            key={row.index}
            data-change={row.kind}
            aria-setsize={rows.length}
            aria-posinset={start + offset + 1}
          >
            <span aria-hidden="true">
              {row.kind === 'collapsed' ? '…' : row.index + 1}
            </span>
            <code>
              {row.kind === 'collapsed' ? (
                text.unchangedLines(row.count)
              ) : (
                <>
                  {row.kind === 'added'
                    ? '+ '
                    : row.kind === 'removed'
                      ? '− '
                      : '  '}
                  {row.text.trimEnd() || ' '}
                </>
              )}
            </code>
          </li>
        ))}
        <li
          role="presentation"
          aria-hidden="true"
          className="ov-file-history__diff-spacer"
          style={{ height: (rows.length - end) * ROW_HEIGHT }}
        />
      </ol>
    </div>
  );
}
