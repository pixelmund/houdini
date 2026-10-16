---
'houdini-svelte': major
---

`graphql()` now returns runes based documents: call a query with its variables inside `$derived` and `await` it (or read `.current`) for automatic reactivity, with server-rendered results hydrated through Svelte's `hydratable`. Set `legacyStores: true` to keep the store based API while migrating.
