import type { HoudiniClient } from '$houdini/runtime/client'
import type {
	GraphQLObject,
	GraphQLVariables,
	QueryResult,
	SubscriptionArtifact,
} from 'houdini/runtime'
import type { DocumentStore } from 'houdini/runtime/client'
import { untrack } from 'svelte'
import { createSubscriber } from 'svelte/reactivity'

import { isBrowser } from './adapter.js'
import { initClient } from './client.js'
import { houdiniContext, stableStringify, type HoudiniContext } from './context.js'
import type { QueryArguments } from './query.svelte.js'

// a SubscriptionFunction is what graphql() returns for a subscription. Calling it gives the
// live subscription for those variables. It's connected while something reads it and
// disconnects once nothing does.
export type SubscriptionFunction<
	_Data extends GraphQLObject,
	_Input extends GraphQLVariables,
	_Artifact extends SubscriptionArtifact = SubscriptionArtifact,
> = ((...args: QueryArguments<_Input>) => SubscriptionResource<_Data, _Input>) & {
	readonly artifact: _Artifact
	readonly kind: 'HoudiniSubscription'
}

export function createSubscription<
	_Data extends GraphQLObject,
	_Input extends GraphQLVariables,
	_Artifact extends SubscriptionArtifact,
>(artifact: _Artifact): SubscriptionFunction<_Data, _Input, _Artifact> {
	const context = houdiniContext()

	const subscription = (variables?: _Input | null, options: { metadata?: App.Metadata } = {}) => {
		const key = `houdini:${artifact.name}:${stableStringify(variables)}`

		let resource = context.resources.get(key) as SubscriptionResource<_Data, _Input> | undefined
		if (!resource) {
			resource = new SubscriptionResource<_Data, _Input>({
				context,
				artifact,
				key,
				variables: (variables ?? null) as _Input,
				metadata: options.metadata,
			})
			context.resources.set(key, resource)
		}
		return resource
	}

	return Object.assign(subscription, {
		artifact,
		kind: 'HoudiniSubscription' as const,
	}) as SubscriptionFunction<_Data, _Input, _Artifact>
}

export class SubscriptionResource<_Data extends GraphQLObject, _Input extends GraphQLVariables> {
	readonly artifact: SubscriptionArtifact
	readonly variables: _Input

	#context: HoudiniContext
	#key: string
	#metadata: App.Metadata | undefined
	#observed = false

	#result: QueryResult<_Data, _Input> = $state.raw({
		data: null,
		errors: null,
		fetching: false,
		partial: false,
		stale: false,
		source: null,
		variables: null,
	})
	#connected = $state(false)

	#subscribe = createSubscriber(() => {
		this.#observed = true

		let observer: DocumentStore<_Data, _Input> | null = null
		let detach: (() => void) | null = null
		let stopped = false

		void initClient().then((client) => {
			if (stopped) {
				return
			}
			observer = (client as HoudiniClient).observe<_Data, _Input>({ artifact: this.artifact })
			detach = observer.subscribe((value) => {
				if (value.source === null && !value.data) {
					return
				}
				untrack(() => {
					this.#result = value
				})
			})
			untrack(() => {
				this.#connected = true
			})
			observer.send({
				variables: this.variables,
				session: this.#context.session(),
				metadata: this.#metadata,
			})
		})

		return () => {
			stopped = true
			this.#observed = false
			detach?.()
			void observer?.cleanup()
			untrack(() => {
				this.#connected = false
			})
			setTimeout(() => {
				if (!this.#observed && this.#context.resources.get(this.#key) === this) {
					this.#context.resources.delete(this.#key)
				}
			}, 0)
		}
	})

	constructor({
		context,
		artifact,
		key,
		variables,
		metadata,
	}: {
		context: HoudiniContext
		artifact: SubscriptionArtifact
		key: string
		variables: _Input
		metadata: App.Metadata | undefined
	}) {
		this.#context = context
		this.artifact = artifact
		this.#key = key
		this.variables = variables
		this.#metadata = metadata
	}

	/** The most recent payload. null until the first event arrives. */
	get current(): _Data | null {
		return this.#read().data
	}

	/** The errors sent with the most recent payload. */
	get errors() {
		return this.#read().errors
	}

	/** True while the subscription is open. */
	get connected(): boolean {
		this.#subscribe()
		return this.#connected
	}

	#read() {
		// subscriptions only run in the browser
		if (isBrowser) {
			this.#subscribe()
		}
		return this.#result
	}
}
