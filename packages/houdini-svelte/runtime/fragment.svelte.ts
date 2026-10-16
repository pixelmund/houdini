import cache from '$houdini/runtime/cache'
import type { HoudiniClient } from '$houdini/runtime/client'
import type { FragmentArtifact, GraphQLObject } from 'houdini/runtime'
import { CompiledFragmentKind, fragmentKey } from 'houdini/runtime'
import type { DocumentStore } from 'houdini/runtime/client'
import { untrack } from 'svelte'
import { createSubscriber } from 'svelte/reactivity'

import { isBrowser } from './adapter.js'
import { initClient } from './client.js'
import { stableStringify } from './context.js'

// a FragmentDocument is what graphql() returns for a fragment. Pass it to fragment() along
// with a reference to read the fragment's data.
export class FragmentDocument<
	_Data extends GraphQLObject,
	_Artifact extends FragmentArtifact = FragmentArtifact,
> {
	readonly kind = CompiledFragmentKind
	readonly artifact: _Artifact

	// carries the data type so fragment() can infer it
	declare readonly shape?: _Data

	constructor(artifact: _Artifact) {
		this.artifact = artifact
	}
}

export function createFragment<_Data extends GraphQLObject, _Artifact extends FragmentArtifact>(
	artifact: _Artifact
) {
	return new FragmentDocument<_Data, _Artifact>(artifact)
}

type FragmentReference = { [fragmentKey]?: any } & Record<string, any>

// the live fragment resources in the browser, keyed by fragment, parent and variables
const resources = new Map<string, FragmentResource<any>>()

// readFragment returns the data for a fragment reference. Called inside of $derived, the
// derived re-runs when the referenced record changes in the cache, or when it's handed a
// different reference.
export function readFragment<_Data extends GraphQLObject>(
	reference: FragmentReference | ReadonlyArray<FragmentReference> | null | undefined,
	document: FragmentDocument<_Data>
): _Data | _Data[] | null {
	const { artifact } = document

	if (Array.isArray(reference) || artifact.plural) {
		if (reference && !Array.isArray(reference)) {
			throw new Error(
				`fragment "${artifact.name}" is marked @plural and must be given a list of references.`
			)
		}
		return ((reference as ReadonlyArray<FragmentReference> | null) ?? []).map(
			(item) => readOne(item, artifact) as _Data
		)
	}

	return readOne(reference as FragmentReference | null | undefined, artifact)
}

function readOne<_Data extends GraphQLObject>(
	reference: FragmentReference | null | undefined,
	artifact: FragmentArtifact
): _Data | null {
	if (!reference) {
		return null
	}

	const info = reference[fragmentKey] ?? {}
	const { variables, parent } = info.values?.[artifact.name] ?? {}
	const loading = Boolean(info.loading)

	// a loading reference renders the fragment's loading state straight from the selection
	if (loading) {
		return cache.read({ selection: artifact.selection, parent, variables, loading: true })
			.data as _Data
	}

	// on the server the parent's data was read without masking, so it already contains
	// every field of the fragment. the same goes for objects that aren't cache references.
	if (!isBrowser || !parent) {
		return reference as _Data
	}

	const key = `${artifact.name}:${parent}:${stableStringify(variables)}`
	let resource = resources.get(key) as FragmentResource<_Data> | undefined
	if (!resource) {
		resource = new FragmentResource<_Data>({ key, artifact, parent, variables })
		resources.set(key, resource)
	}

	return resource.read()
}

class FragmentResource<_Data extends GraphQLObject> {
	#key: string
	#artifact: FragmentArtifact
	#parent: string
	#variables: Record<string, any> | undefined

	#data: _Data | null = $state.raw(null)
	#observed = false

	#subscribe = createSubscriber(() => {
		this.#observed = true

		let observer: DocumentStore<_Data, any> | null = null
		let detach: (() => void) | null = null
		let stopped = false

		const connect = (client: HoudiniClient) => {
			if (stopped) {
				return
			}
			observer = client.observe<_Data, any>({
				artifact: this.#artifact,
				initialValue: untrack(() => this.#data),
			})
			detach = observer.subscribe((value) => {
				untrack(() => {
					this.#data = value.data
				})
			})
			// the fragment plugin subscribes the store to the parent record in the cache
			observer.send({
				variables: this.#variables,
				setup: true,
				stuff: { parentID: this.#parent },
			})
		}

		void initClient().then(connect)

		return () => {
			stopped = true
			this.#observed = false
			detach?.()
			setTimeout(() => {
				if (!this.#observed && resources.get(this.#key) === this) {
					resources.delete(this.#key)
				}
			}, 0)
		}
	})

	constructor({
		key,
		artifact,
		parent,
		variables,
	}: {
		key: string
		artifact: FragmentArtifact
		parent: string
		variables: Record<string, any> | undefined
	}) {
		this.#key = key
		this.#artifact = artifact
		this.#parent = parent
		this.#variables = variables

		// read the masked value from the cache so the first render already has the data
		this.#data = cache.read({ selection: artifact.selection, parent, variables }).data as _Data
	}

	read(): _Data | null {
		this.#subscribe()
		return this.#data
	}
}
