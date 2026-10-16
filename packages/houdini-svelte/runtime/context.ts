import { getContext, hasContext, hydratable, setContext } from 'svelte'

import { isBrowser } from './adapter.js'
import { getClientSession, setClientSession } from './session.js'

const contextKey = Symbol.for('houdini-svelte.context')

// A HoudiniContext scopes the live document resources (so identical calls share one
// request) and the session those requests are sent with. The browser has exactly one.
// During SSR the root layout installs a fresh one per request so concurrent renders
// never see each other's data or session.
export type HoudiniContext = {
	session(): App.Session | {}
	resources: Map<string, unknown>
}

const browserContext: HoudiniContext = {
	session: () => getClientSession(),
	resources: new Map(),
}

// setHoudiniContext is injected at the top of the root layout. On the server it scopes
// everything rendered below it to the current request. In the browser it seeds the client
// session synchronously so that queries started during hydration (before the layout's
// effects run) are sent with the right session.
export function setHoudiniContext(session: App.Session | {} | undefined | null) {
	if (isBrowser) {
		if (session && Object.keys(getClientSession()).length === 0) {
			setClientSession(session as App.Session)
		}
		return
	}

	setContext(contextKey, {
		session: () => session ?? {},
		resources: new Map(),
	} satisfies HoudiniContext)
}

// houdiniContext returns the context a document created right now belongs to. it has to be
// called during component initialization to see the per-request context on the server.
export function houdiniContext(): HoudiniContext {
	if (isBrowser) {
		return browserContext
	}

	try {
		if (hasContext(contextKey)) {
			return getContext<HoudiniContext>(contextKey)
		}
	} catch {
		// not inside of a component (eg. a load function)
	}

	// nothing to share with: give the caller a private context
	return { session: () => ({}), resources: new Map() }
}

// safeHydratable wraps svelte's hydratable so the runtime keeps working when the app hasn't
// enabled experimental.async (hydratable throws in that case).
export function safeHydratable<T>(key: string, fn: () => T): T {
	try {
		return hydratable(key, fn)
	} catch {
		return fn()
	}
}

// hasHydratedValue reports whether the server serialized a value for the key. Asking
// svelte's hydratable for a key the server never set is an error in development, and a
// document can legitimately be fetched in the browser without having rendered on the
// server (eg. behind a browser-only branch).
export function hasHydratedValue(key: string): boolean {
	return Boolean((globalThis as any).window?.__svelte?.h?.has(key))
}

// stableStringify is a deterministic JSON.stringify used to key documents by their variables
export function stableStringify(value: unknown): string {
	if (value === undefined) {
		return 'null'
	}
	if (value === null || typeof value !== 'object') {
		return JSON.stringify(value)
	}
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(',')}]`
	}
	if (value instanceof Date) {
		return JSON.stringify(value)
	}
	const entries = Object.keys(value)
		.filter((key) => (value as Record<string, unknown>)[key] !== undefined)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringify((value as any)[key])}`)
	return `{${entries.join(',')}}`
}
