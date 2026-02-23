import { $ } from 'bun'
import * as path from 'path'

/**
 * Docker architectures configuration
 * Keys are the architecture directory names, values contain metadata
 */
const DOCKER_ARCHS = {
    'linux-arm64': { archDir: 'linux-arm64', arch: 'arm64', os: 'linux' },
    'linux-x64': { archDir: 'linux-x64', arch: 'amd64', os: 'linux' },
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
                verbose: {
                    type: CapsulePropertyTypes.Literal,
                    value: false,
                },

                DOCKER_ARCHS: {
                    type: CapsulePropertyTypes.Constant,
                    value: DOCKER_ARCHS,
                },

                /**
                 * Get the current architecture platform
                 */
                getCurrentPlatform: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any): 'arm64' | 'amd64' {
                        const arch = process.arch;
                        if (arch === 'arm64') {
                            return 'arm64';
                        }
                        return 'amd64';
                    }
                },

                /**
                 * Get the current platform's architecture key for DOCKER_ARCHS
                 */
                getCurrentPlatformArch: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any): keyof typeof DOCKER_ARCHS {
                        const platform = this.getCurrentPlatform();
                        return platform === 'arm64' ? 'linux-arm64' : 'linux-x64';
                    }
                },

                /**
                 * Core exec method — ALL Docker CLI calls go through here.
                 * Returns trimmed stdout text.
                 */
                exec: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, args: string[], options?: { stdin?: string; retry?: number | boolean; retryDelayMs?: number }): Promise<string> {
                        const maxAttempts = options?.retry === true ? 3 : (options?.retry || 1);
                        const delayMs = options?.retryDelayMs ?? 5000;

                        const attempt = async (): Promise<string> => {
                            if (this.verbose) {
                                console.log(`[docker] Executing: docker ${args.join(' ')}`);
                            }
                            if (options?.stdin !== undefined) {
                                const proc = Bun.spawn(['docker', ...args], {
                                    stdin: 'pipe',
                                    stdout: 'pipe',
                                    stderr: 'pipe',
                                });
                                proc.stdin.write(options.stdin);
                                proc.stdin.end();
                                const [stdout, stderr] = await Promise.all([
                                    new Response(proc.stdout).text(),
                                    new Response(proc.stderr).text(),
                                ]);
                                await proc.exited;
                                if (proc.exitCode !== 0) {
                                    throw new Error(`docker ${args[0]} failed (exit ${proc.exitCode}): ${stderr}`);
                                }
                                return stdout.trim();
                            }
                            const result = await $`docker ${args}`.text();
                            return result.trim();
                        };

                        let lastError: unknown;
                        for (let i = 1; i <= maxAttempts; i++) {
                            try {
                                return await attempt();
                            } catch (err) {
                                lastError = err;
                                if (i < maxAttempts) {
                                    console.error(`  ⚠️  docker ${args[0]} attempt ${i}/${maxAttempts} failed, retrying in ${delayMs / 1000}s...`);
                                    await new Promise(r => setTimeout(r, delayMs));
                                }
                            }
                        }
                        throw lastError;
                    }
                },

                /**
                 * Tag a Docker image — shared by Image and Context capsules
                 */
                tagImage: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: { sourceImage: string; targetImage: string }): Promise<string> {
                        const { sourceImage, targetImage } = options;
                        if (this.verbose) {
                            console.log(`[docker:tagImage] Tagging image: ${sourceImage} -> ${targetImage}`);
                        }
                        return await this.exec(['tag', sourceImage, targetImage]);
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44-docker.com/caps/Cli',
    })
}
