import { join } from 'path'
import { readFile } from 'fs/promises'

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
                tagVersion: {
                    type: CapsulePropertyTypes.Literal,
                    value: false,
                },
                buildVariants: {
                    type: CapsulePropertyTypes.Literal,
                    value: { alpine: true, distroless: false } as Record<string, boolean>,
                },
                dockerfile: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as string | undefined,
                },

                DOCKERFILE_VARIANTS: {
                    type: CapsulePropertyTypes.Constant,
                    value: DOCKERFILE_VARIANTS,
                },

                /**
                 * Read the version from appBaseDir/package.json.
                 * Strips any leading 'v' prefix.
                 */
                getVersion: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<string> {
                        if (!this.appBaseDir) {
                            throw new Error('appBaseDir must be set to get version');
                        }
                        const packageJsonPath = join(this.appBaseDir, 'package.json');
                        const content = await readFile(packageJsonPath, 'utf-8');
                        const pkg = JSON.parse(content);
                        if (!pkg.version) {
                            throw new Error(`no "version" field in package.json at ${packageJsonPath}`);
                        }
                        const version = pkg.version.startsWith('v') ? pkg.version.slice(1) : pkg.version;
                        return version;
                    }
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

                /**
                 * Compute version image tag (local, arch-specific).
                 * Format: org/repo:VERSION-variant-arch
                 * Example: myorg/myapp:1.0.0-alpine-arm64
                 */
                getVersionImageTag: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, opts: { variant?: string; arch?: string; version: string }): string {
                        const variant = opts?.variant ?? this.variant;
                        const arch = opts?.arch ?? this.arch;
                        if (!variant || !arch) {
                            throw new Error('variant and arch must be set to get version image tag');
                        }
                        if (!opts.version) {
                            throw new Error('version must be provided to get version image tag');
                        }
                        const variantInfo = DOCKERFILE_VARIANTS[variant as keyof typeof DOCKERFILE_VARIANTS];
                        const archInfo = this.cli.DOCKER_ARCHS[arch as keyof typeof this.cli.DOCKER_ARCHS];
                        const version = opts.version.startsWith('v') ? opts.version.slice(1) : opts.version;
                        return `${this.organization}/${this.repository}:${version}-${variantInfo.tagSuffix}-${archInfo.arch}`;
                    }
                },

                /**
                 * Compute multi-arch manifest version image tag (arch-agnostic).
                 * Format: org/repo:VERSION-variant
                 * Example: myorg/myapp:1.0.0-alpine
                 * Registry serves the correct arch via manifest lists.
                 */
                getMultiArchManifestVersionImageTag: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, opts: { variant?: string; version: string }): string {
                        const variant = opts?.variant ?? this.variant;
                        if (!variant) {
                            throw new Error('variant must be set to get multi-arch manifest version image tag');
                        }
                        if (!opts.version) {
                            throw new Error('version must be provided to get multi-arch manifest version image tag');
                        }
                        const variantInfo = DOCKERFILE_VARIANTS[variant as keyof typeof DOCKERFILE_VARIANTS];
                        const version = opts.version.startsWith('v') ? opts.version.slice(1) : opts.version;
                        return `${this.organization}/${this.repository}:${version}-${variantInfo.tagSuffix}`;
                    }
                },

                /**
                 * Compute multi-arch manifest latest image tag (arch-agnostic).
                 * Format: org/repo:latest-variant
                 * Example: myorg/myapp:latest-alpine
                 */
                getMultiArchManifestLatestImageTag: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, opts?: { variant?: string }): string {
                        const variant = opts?.variant ?? this.variant;
                        if (!variant) {
                            throw new Error('variant must be set to get multi-arch manifest latest image tag');
                        }
                        const variantInfo = DOCKERFILE_VARIANTS[variant as keyof typeof DOCKERFILE_VARIANTS];
                        return `${this.organization}/${this.repository}:latest-${variantInfo.tagSuffix}`;
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
