/// <references types="houdini-svelte">

/** @type {import('houdini').ConfigFile} */
const config = {
	schemaPath: '../_api/schema.graphql',
	url: 'http://localhost:4000/graphql',
	runtimeDir: '.houdini',

	scalars: {
		DateTime: {
			type: 'Date',
			inputTypes: ['Int', 'String'],
			unmarshal(val) {
				return new Date(val)
			},
			marshal(val) {
				return val.getTime()
			},
		},
		File: {
			type: 'File',
		},
	},

	types: {
		RentedBook: {
			keys: ['userId', 'bookId'],
		},
		UnionAorB: {
			keys: [],
		},
		RefetchableEntity: {
			keys: ['id'],
			resolve: {
				queryField: 'refetchableEntity',
				arguments: (entity) => ({ id: entity.id }),
			},
		},
	},

	plugins: {
		'houdini-svelte': {},
	},
}

export default config
