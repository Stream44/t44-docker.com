
export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: any) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/t44/caps/ConfigSchemaStruct': {
                as: 'schema',
                options: {
                    '#': {
                        schema: {
                            type: 'object',
                            properties: {
                                username: {
                                    type: 'string',
                                    title: 'Docker Hub Username',
                                    description: 'Your Docker Hub username from https://hub.docker.com',
                                    minLength: 1,
                                },
                                password: {
                                    type: 'string',
                                    title: 'Docker Hub Password or Personal Access Token',
                                    description: 'Your Docker Hub password or a Personal Access Token (PAT) from https://hub.docker.com/settings/security',
                                    minLength: 1,
                                },
                                organization: {
                                    type: 'string',
                                    title: 'Docker Hub Organization (optional)',
                                    description: 'Your Docker Hub organization name. Leave empty to use your username as the namespace.',
                                },
                            },
                            required: ['username', 'password']
                        }
                    }
                }
            },
            '#': {
                capsuleName: {
                    type: CapsulePropertyTypes.Literal,
                    value: capsule['#']
                },
                // Schema-defined fields exposed as Literals so non-secret values can be
                // wired via Mapping options (e.g. in tests) instead of stored config.
                // getConfigValue() prefers these when set.
                username: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as string | undefined,
                },
                password: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as string | undefined,
                },
                organization: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as string | undefined,
                },
            }
        }
    }, {
        extendsCapsule: '@stream44.studio/t44/caps/WorkspaceConnection',
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = '@stream44.studio/t44-docker.com/structs/Hub/WorkspaceConnectionConfig'
