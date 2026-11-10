'use client';

import { type KeyboardEvent, type ReactNode, useId, useRef } from 'react';

export interface Tab {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

/**
 * ARIA tabs (NFR-14): one tab stop for the list; the arrow keys move between tabs in reading
 * direction (right to left in Arabic), Home and End go to the first and last.
 */
export function Tabs({
  label,
  tabs,
  selected,
  onSelect,
}: {
  label: string;
  tabs: readonly Tab[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const base = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === selected),
  );

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    let next: number | null = null;
    if (event.key === forward) next = (index + 1) % tabs.length;
    if (event.key === back) next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    const tab = tabs[next];
    if (tab) {
      onSelect(tab.id);
      buttons.current[next]?.focus();
    }
  };

  const current = tabs[index];
  return (
    <div className="reih-tabs">
      <div role="tablist" aria-label={label} className="reih-tablist" onKeyDown={move}>
        {tabs.map((tab, position) => (
          <button
            key={tab.id}
            ref={(element) => {
              buttons.current[position] = element;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${tab.id}`}
            aria-selected={position === index}
            aria-controls={`${base}-panel-${tab.id}`}
            tabIndex={position === index ? 0 : -1}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {current && (
        <div
          role="tabpanel"
          id={`${base}-panel-${current.id}`}
          aria-labelledby={`${base}-tab-${current.id}`}
          tabIndex={0}
          className="reih-tabpanel"
        >
          {current.content}
        </div>
      )}
    </div>
  );
}
