import type { HoudiniClient } from '$houdini/runtime/client'
import type { RequestEvent } from '@sveltejs/kit'
import type {
	GraphQLObject,
	GraphQLVariables,
	MutationArtifact,
	QueryResult,
} from 'houdini/runtime'
import type { DocumentStore } from 'houdini/runtime/client'

import { initClient } from './client.js'
import { houdiniContext, type HoudiniContext } from './context.js'
import { getSession } from './session.js'

export type MutateOptions<_Optimistic> = {
	metadata?: App.Metadata
	fetch?: typeof globalThis.fetch
	/** pass the event when mutating from a form action or endpoint */
	event?: RequestEvent
	abortController?: AbortController
	optimisticResponse?: _Optimistic
}

// a MutationDocument is what graphql() returns for a mutation
export class MutationDocument<
	_Data extends GraphQLObject,
	_Input extends GraphQLVariables,
	_Optimistic extends GraphQLObject = GraphQLObject,
	_Artifact extends MutationArtifact = MutationArtifact,
> {
	readonly kind = 'HoudiniMutation' as const
	readonly artifact: _Artifact

	#context: HoudiniContext
	#observer: DocumentStore<_Data, _Input> | null = null
	#inflight = $state(0)
	#result: QueryResult<_Data, _Input> | null = $state.raw(null)

	constructor(artifact: _Artifact) {
		this.artifact = artifact
		this.#context = houdiniContext()
	}

	/** True while a mutation is in flight. */
	get pending(): boolean {
		return this.#inflight > 0
	}

	/** The result of the most recent mutation. */
	get result(): QueryResult<_Data, _Input> | null {
		return this.#result
	}

	async mutate(
		variables: _Input,
		{
			metadata,
			fetch,
			event,
			abortController,
			optimisticResponse,
		}: MutateOptions<_Optimistic> = {}
	): Promise<QueryResult<_Data, _Input>> {
		const client = (await initClient()) as HoudiniClient
		this.#observer ??= client.observe<_Data, _Input>({ artifact: this.artifact })

		const session = event ? await getSession(event) : this.#context.session()

		this.#inflight++
		try {
			const result = await this.#observer.send({
				variables,
				fetch: fetch ?? event?.fetch,
				metadata,
				session,
				abortController,
				stuff: { optimisticResponse },
			})
			this.#result = result
			return result
		} finally {
			this.#inflight--
		}
	}
}

export function createMutation<
	_Data extends GraphQLObject,
	_Input extends GraphQLVariables,
	_Optimistic extends GraphQLObject,
	_Artifact extends MutationArtifact,
>(artifact: _Artifact) {
	return new MutationDocument<_Data, _Input, _Optimistic, _Artifact>(artifact)
}
