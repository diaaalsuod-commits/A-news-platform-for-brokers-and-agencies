# Spikes (throwaway)

Experiments only. Nothing here is imported by `apps/` or `packages/`, and this folder is not part of
the pnpm workspace. The results are recorded in [docs/decisions.md](../docs/decisions.md).

```bash
pnpm install --ignore-workspace
```

```bash
PLAYWRIGHT_BROWSERS_PATH=0 pnpm exec playwright install chromium
```

```bash
node pdf/arabic.mjs
```

```bash
node map/clusters.mjs
```

All demo content is fictional (D-02). Output goes to `spikes/out/`.
