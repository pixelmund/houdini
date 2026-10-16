import type { HoudiniClient } from '$houdini/runtime/client'
import type {
	CachePolicies,
	GraphQLError,
	GraphQLObject,
	GraphQLVariables,
	QueryArtifact,
	QueryResult,
} from 'houdini/runtime'
import { CachePolicy } from 'houdini/runtime'
import type { DocumentStore } from 'houdini/runtime/client'
import { untrack } from 'svelte'
import { createSubscriber } from 'svelte/reactivity'

import { isBrowser } from './adapter.js'
import { initClient } from './client.js'
import {
	hasHydratedValue,
	houdiniContext,
	safeHydratable,
	stableStringify,
	type HoudiniContext,
} from './context.js'
import { QueryStore } from './stores/query.js'
import type { QueryStoreFetchParams } from './types.js'

export type QueryOptions = {
	policy?: CachePolicies
	metadata?: App.Metadata
}

// the arguments a query function accepts: variables are required only when the document
// has a required variable without a default
export type QueryArguments<_Input> = [_Input] extends [null | undefined]
	? [variables?: null, options?: QueryOptions]
	: {} extends _Input
		? [variables?: _Input | null, options?: QueryOptions]
		: [variables: _Input, options?: QueryOptions]

// a QueryFunction is what graphql() returns for a query document. Calling it with variables
// gives the (shared) QueryResource for those variables. Calling it inside of $derived makes
// the variables reactive: when they change, the derived re-runs and picks up the resource
// for the new variables.
export type QueryFunction<
	_Data extends GraphQLObject,
	_Input extends GraphQLVariables,
	_Artifact extends QueryArtifact = QueryArtifact,
> = ((...args: QueryArguments<_Input>) => QueryResource<_Data, _Input>) & {
	readonly artifact: _Artifact
	readonly kind: 'HoudiniQuery'
	/**
	 * Send the query imperatively, for example from a load function, form action or endpoint.
	 * Inside components, call the query function instead.
	 */
	fetch(params?: QueryStoreFetchParams<_Data, _Input>): Promise<QueryResult<_Data, _Input>>
}

export class GraphQLErrors extends Error {
	readonly errors: GraphQLError[]

	constructor(errors: GraphQLError[]) {
		super(errors.map((error) => error.message).join('. '))
		this.name = 'GraphQLErrors'
		this.errors = errors
	}
}

export function createQuery<
	_Data extends GraphQLObject,
	_Input extends GraphQLVariables,
	_Artifact extends QueryArtifact,
>(artifact: _Artifact): QueryFunction<_Data, _Input, _Artifact> {
	// the context has to be captured now (during component initialization) since the
	// function is usually invoked later from inside of a $derived
	const context = houdiniContext()

	const query = (variables?: _Input | null, options: QueryOptions = {}) => {
		const usedVariables = {
			...artifact.input?.defaults,
			...variables,
		} as _Input
		const key = `houdini:${artifact.name}:${stableStringify(usedVariables)}`

		let resource = context.resources.get(key) as QueryResource<_Data, _Input> | undefined
		if (!resource) {
			resource = new QueryResource<_Data, _Input>({
				context,
				artifact,
				key,
				variables: usedVariables,
				options,
			})
			context.resources.set(key, resource)
		}

		return resource
	}

	return Object.assign(query, {
		artifact,
		kind: 'HoudiniQuery' as const,
		fetch(params?: QueryStoreFetchParams<_Data, _Input>) {
			return new QueryStore<_Data, _Input>({
				artifact,
				storeName: artifact.name,
				variables: false,
			}).fetch(params)
		},
	}) as QueryFunction<_Data, _Input, _Artifact>
}

// A QueryResource is the live result of a query for one set of variables.
//
// - `await resource` (or `$derived(await query(vars))`) resolves to the data once it's
//   available. When the data changes later (a cache update, a refetch) the awaiting
//   derived re-runs and resolves to the new value.
// - `resource.current` / `.loading` / `.errors` read the same state without suspending.
//
// The resource only listens to the cache while something reads it (createSubscriber).
// On the server, the raw response is serialized with svelte's hydratable so the browser
// can hydrate the cache without sending the request again.
export class QueryResource<_Data extends GraphQLObject, _Input extends GraphQLVariables>
	implements PromiseLike<_Data>
{
	readonly artifact: QueryArtifact
	readonly variables: _Input

	#context: HoudiniContext
	#key: string
	#options: QueryOptions

	#observer: DocumentStore<_Data, _Input> | null = null
	#detach: (() => void) | null = null
	#observed = false

	#result: QueryResult<_Data, _Input> = $state.raw({
		data: null,
		errors: null,
		fetching: true,
		partial: false,
		stale: false,
		source: null,
		variables: null,
	})

	// an error thrown by the pipeline (eg. a network failure or throwOnError)
	#error: unknown = $state.raw(null)

	// the most recent request. replacing it (eg. refresh) re-runs anything awaiting the resource
	#request: Promise<void> | null = $state.raw(null)

	// bumped when the cache changes the result outside of one of our own requests (a mutation,
	// a subscription, a refetch the cache asked for). awaiting derived re-run when it changes.
	// a request's own result must not bump it: it reaches the awaiting derived through the
	// promise, and re-running the derived while the batch that started the request is still
	// pending (eg. hydration) would evaluate it against stale state.
	#version = $state(0)
	#inflight = 0

	#subscribe = createSubscriber(() => {
		this.#observed = true
		this.#attach()

		return () => {
			this.#observed = false
			this.#detach?.()
			this.#detach = null
			this.#scheduleEviction()
		}
	})

	constructor({
		context,
		artifact,
		key,
		variables,
		options,
	}: {
		context: HoudiniContext
		artifact: QueryArtifact
		key: string
		variables: _Input
		options: QueryOptions
	}) {
		this.#context = context
		this.artifact = artifact
		this.#key = key
		this.variables = variables
		this.#options = options
	}

	/** The latest data for the query. Reading this does not suspend. */
	get current(): _Data | null {
		return this.#read().data
	}

	/** True while a request for this query is in flight. */
	get loading(): boolean {
		return this.#read().fetching
	}

	/** The errors returned by the API for the most recent request. */
	get errors(): GraphQLError[] | null {
		return this.#read().errors
	}

	/** The error thrown by the most recent request (a network failure, throwOnError, ...). */
	get error(): unknown {
		this.#read()
		return this.#error
	}

	/** The full query result (data, errors, fetching, partial, stale, source). */
	get result(): QueryResult<_Data, _Input> {
		return this.#read()
	}

	/** Send the query to the API again, ignoring the cache. */
	refresh(): Promise<_Data> {
		const request = this.#track(this.#send(CachePolicy.NetworkOnly))
		return request.then(() => this.#unwrap())
	}

	// awaiting the resource reads its state from inside of the `then` getter: svelte calls it
	// synchronously while it tracks the async derived's dependencies, so the derived re-runs
	// whenever a new request starts or the cache updates the result.
	// biome-ignore lint/suspicious/noThenProperty: awaiting the resource is the point
	get then(): PromiseLike<_Data>['then'] {
		this.#subscribe()
		const request = this.#start()
		void this.#version

		return (onfulfilled, onrejected) =>
			request.then(() => this.#unwrap()).then(onfulfilled, onrejected)
	}

	#read() {
		this.#subscribe()
		// on the server only awaited queries are sent (and serialized for hydration).
		// reading the current value renders the loading state instead.
		if (isBrowser) {
			this.#start()
		}
		return this.#result
	}

	#start(): Promise<void> {
		if (!untrack(() => this.#request)) {
			this.#track(this.#send(this.#options.policy))
		}
		return this.#request!
	}

	#track(request: Promise<void>) {
		// a resource that's only read through .current has nobody handling the rejection
		request.catch(() => {})
		untrack(() => {
			this.#request = request
		})
		return request
	}

	// awaiting a query resolves to its data and rejects with the errors when there is none.
	// (a CacheOnly query that misses the cache resolves to null)
	#unwrap(): _Data {
		const result = untrack(() => this.#result)
		if (result.errors?.length && !result.data) {
			throw new GraphQLErrors(result.errors)
		}
		return result.data as _Data
	}

	#set(result: QueryResult<_Data, _Input>) {
		untrack(() => {
			this.#result = result
		})
	}

	async #send(policy: CachePolicies | undefined) {
		// everything up to the first await runs synchronously while svelte is rendering
		// (or hydrating), which is the only time hydratable can be called

		// in the browser, look for the response the server rendered with
		const hydrated =
			isBrowser && hasHydratedValue(this.#key)
				? safeHydratable<Promise<unknown> | unknown>(this.#key, () => null)
				: null

		// on the server, register the response so it's serialized into the page
		let capture: ((payload: unknown) => void) | null = null
		if (!isBrowser) {
			const payload = new Promise<unknown>((resolve) => {
				capture = resolve
			})
			safeHydratable(this.#key, () => payload)
		}

		this.#inflight++
		try {
			const client = (await initClient()) as HoudiniClient
			const observer = this.#ensureObserver(client)
			const session = this.#context.session()

			let fetch = observer.getFetch(() => session)
			const replay = await hydrated
			if (replay) {
				fetch = replayFetch(replay)
			}
			if (capture) {
				fetch = captureFetch(fetch, capture)
			}

			const result = await observer.send({
				variables: this.variables,
				policy,
				session,
				metadata: this.#options.metadata,
				fetch,
			})
			untrack(() => {
				this.#error = null
			})
			this.#set(result)
		} catch (error) {
			untrack(() => {
				this.#error = error
				this.#result = { ...this.#result, fetching: false }
			})
			throw error
		} finally {
			this.#inflight--

			// never leave the serialized value pending
			;(capture as ((payload: unknown) => void) | null)?.(null)

			// a resource that was only awaited imperatively (eg. in an event handler)
			// is never observed, so nothing would ever release it
			if (!this.#observed) {
				this.#scheduleEviction()
			}
		}
	}

	#ensureObserver(client: HoudiniClient) {
		if (!this.#observer) {
			this.#observer = client.observe<_Data, _Input>({
				artifact: this.artifact,
				initialValue: untrack(() => this.#result.data),
			})
			this.#attach()
		}
		return this.#observer
	}

	// listen to the document store (and therefore the cache) while the resource is observed
	#attach() {
		if (!this.#observed || !this.#observer || this.#detach) {
			return
		}
		this.#detach = this.#observer.subscribe((value) => {
			// the store emits its current value immediately, which is the empty initial state
			// until the first request comes back
			if (value.source === null && !value.data) {
				return
			}
			this.#set(value)
			if (this.#inflight === 0) {
				untrack(() => {
					this.#version++
				})
			}
		})
	}

	// once nothing reads the resource anymore, forget it. the data itself stays in the cache
	// so a later call with the same variables is served from there.
	#scheduleEviction() {
		if (!isBrowser) {
			// the server context only lives as long as the request
			return
		}
		setTimeout(() => {
			if (this.#observed || this.#context.resources.get(this.#key) !== this) {
				return
			}
			this.#context.resources.delete(this.#key)
		}, 0)
	}
}

// replayFetch answers the request with the response the server serialized, so the result
// goes through the normal pipeline (cache write, subscriptions) without touching the network
function replayFetch(payload: unknown): typeof globalThis.fetch {
	return async () =>
		new Response(JSON.stringify(payload), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		})
}

// captureFetch hands a copy of the raw response body to the hydration payload
function captureFetch(
	fetch: typeof globalThis.fetch,
	capture: (payload: unknown) => void
): typeof globalThis.fetch {
	return async (input, init) => {
		const response = await fetch(input, init)
		try {
			capture(await response.clone().json())
		} catch {
			capture(null)
		}
		return response
	}
}
