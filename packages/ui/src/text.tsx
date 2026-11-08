import type { ReactNode } from 'react';

/**
 * Rich-text tags for next-intl's t.rich(). <ltr> wraps numbers, dates and Latin tokens inside
 * Arabic text in <bdi dir="ltr"> (CLAUDE.md, Frontend conventions).
 */
export const richTags = {
  ltr: (chunks: ReactNode) => <bdi dir="ltr">{chunks}</bdi>,
  strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
};

/** A number, date or Latin token placed inside text of either language. */
export function Ltr({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}
