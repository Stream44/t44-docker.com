import { join } from 'path'

const DEFAULT_TEMPLATE_DIR = join(__dirname, 'Image', 'tpl');

const DOCKERFILE_VARIANTS = {
    alpine: { dockerfile: 'Dockerfile.alpine', tagSuffix: 'alpine', variantDir: 'alpine', variant: 'alpine' },
    distroless: { dockerfile: 'Dockerfile.distroless', tagSuffix: 'distroless', variantDir: 'distroless', variant: 'distroless' },
} as const;

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
                cli: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './Cli',
                },

                verbose: {
                    type: CapsulePropertyTypes.Literal,
                    value: false,
                },
                organization: {
                    type: CapsulePropertyTypes.Literal,
                    value: '' as string,
                },
                repository: {
                    type: CapsulePropertyTypes.Literal,
                    value: '' as string,
                },
                appBaseDir: {
                    type: CapsulePropertyTypes.Literal,
                    value: '' as string,
                },
                buildContextBaseDir: {
                    type: CapsulePropertyTypes.Literal,
                    value: '' as string,
                },
                templateDir: {
                    type: CapsulePropertyTypes.Literal,
                    value: DEFAULT_TEMPLATE_DIR as string,
                },
                variant: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as string | undefined,
                },
                arch: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as string | undefined,
                },
                buildScriptName: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as string | undefined,
                },
                files: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as Record<string, any> | undefined,
                },
                attestations: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as { sbom?: boolean; provenance?: boolean } | undefined,
                },
                tagLatest: {
                    type: CapsulePropertyTypes.Literal,
                    value: false,
                },

                DOCKERFILE_VARIANTS: {
                    type: CapsulePropertyTypes.Constant,
                    value: DOCKERFILE_VARIANTS,
                },

                /**
                 * Compute image tag from org/repo/variant/arch
                 */
                getImageTag: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, opts?: { variant?: string; arch?: string }): string {
                        const variant = opts?.variant ?? this.variant;
                        const arch = opts?.arch ?? this.arch;
                        if (!variant || !arch) {
                            throw new Error('variant and arch must be set to get image tag');
                        }
                        const variantInfo = DOCKERFILE_VARIANTS[variant as keyof typeof DOCKERFILE_VARIANTS];
                        const archInfo = this.cli.DOCKER_ARCHS[arch as keyof typeof this.cli.DOCKER_ARCHS];
                        return `${this.organization}/${this.repository}:${variantInfo.tagSuffix}-${archInfo.arch}`;
                    }
                },

                getLatestImageTag: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, opts?: { variant?: string; arch?: string }): string {
                        return `${this.getImageTag(opts)}-latest`;
                    }
                },

                getBuildContextDir: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, opts?: { variant?: string }): string {
                        const variant = opts?.variant ?? this.variant;
                        if (!variant) {
                            throw new Error('variant must be set to get build context directory');
                        }
                        const effectiveBuildContextBaseDir = this.buildContextBaseDir
                            || (this.appBaseDir ? join(this.appBaseDir, '.~o/t44-docker.com') : '');
                        return join(effectiveBuildContextBaseDir, DOCKERFILE_VARIANTS[variant as keyof typeof DOCKERFILE_VARIANTS].variantDir);
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44-docker.com/caps/ImageContext',
    })
}
