export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: {
    encapsulate: any
    CapsulePropertyTypes: any
    makeImportStack: any
}) {

    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                verbose: {
                    type: CapsulePropertyTypes.Literal,
                    value: true,
                },
                showOutput: {
                    type: CapsulePropertyTypes.Literal,
                    value: false,
                },
                image: {
                    type: CapsulePropertyTypes.Literal,
                    value: '' as string,
                },
                name: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as string | undefined,
                },
                ports: {
                    type: CapsulePropertyTypes.Literal,
                    value: [] as { internal: number; external: number }[],
                },
                volumes: {
                    type: CapsulePropertyTypes.Literal,
                    value: [] as string[],
                },
                env: {
                    type: CapsulePropertyTypes.Literal,
                    value: {} as Record<string, string>,
                },
                network: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as string | undefined,
                },
                workdir: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as string | undefined,
                },
                waitFor: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as string | undefined,
                },
                waitTimeout: {
                    type: CapsulePropertyTypes.Literal,
                    value: 30000,
                },
                detach: {
                    type: CapsulePropertyTypes.Literal,
                    value: true,
                },
                removeOnExit: {
                    type: CapsulePropertyTypes.Literal,
                    value: false,
                },

                derive: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, overrides?: {
                        image?: string;
                        name?: string;
                        ports?: { internal: number; external: number }[];
                        volumes?: string[];
                        env?: Record<string, string>;
                        network?: string;
                        workdir?: string;
                        waitFor?: string;
                        waitTimeout?: number;
                        detach?: boolean;
                        removeOnExit?: boolean;
                        verbose?: boolean;
                        showOutput?: boolean;
                        command?: string;
                    }): Record<string, any> {
                        return {
                            image: this.image,
                            name: this.name,
                            ports: this.ports,
                            volumes: this.volumes,
                            env: this.env,
                            network: this.network,
                            workdir: this.workdir,
                            waitFor: this.waitFor,
                            waitTimeout: this.waitTimeout,
                            detach: this.detach,
                            removeOnExit: this.removeOnExit,
                            verbose: this.verbose,
                            showOutput: this.showOutput,
                            ...overrides,
                        };
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44-docker.com/caps/ContainerContext',
    })
}
