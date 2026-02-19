#!/usr/bin/env bun test --timeout 180000

import * as bunTest from 'bun:test'
import { describe, it, expect } from 'bun:test'
import { run } from 't44/standalone-rt'
import { join, basename } from 'path'
import { mkdir, writeFile } from 'fs/promises'

const { test: { workbenchDir } } = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceTest',
                    options: { '#': { bunTest, env: {} } }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44-docker.com/caps/Project.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, { importMeta: import.meta })

async function createSampleApp(baseDir: string): Promise<void> {
    await mkdir(baseDir, { recursive: true });

    await writeFile(join(baseDir, 'index.ts'), `
const server = Bun.serve({
    port: 3000,
    fetch(req) {
        return new Response("Hello from project test!");
    },
});
console.log("READY");
console.log(\`Server running on port \${server.port}\`);
`);

    await writeFile(join(baseDir, 'package.json'), JSON.stringify({
        name: 'project-test-app',
        version: '0.1.0',
        scripts: { start: 'bun run index.ts' }
    }, null, 2));
}

describe('Project Capsule', () => {

    describe('getDevelopmentContainerConfig', () => {
        it('should return correct container config', async () => {
            const config = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
                const spine = await encapsulate({
                    '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
                        '#@stream44.studio/encapsulate/structs/Capsule': {},
                        '#': {
                            project: {
                                type: CapsulePropertyTypes.Mapping,
                                value: './Project',
                                options: {
                                    '@stream44.studio/t44-docker.com/caps/ImageContext': {
                                        '#': {
                                            organization: 'test-docker-com',
                                            repository: 'project-config-test',
                                            appBaseDir: '/tmp/test',
                                            verbose: false
                                        },
                                    },
                                    '@stream44.studio/t44-docker.com/caps/ContainerContext': {
                                        '#': {
                                            ports: [{ internal: 3000, external: 4000 }],
                                        },
                                    },
                                },
                            },
                        }
                    }
                }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44-docker.com/caps/Project.test.config' })
                return { spine }
            }, async ({ spine, apis }: any) => {
                return apis[spine.capsuleSourceLineRef].project.getDevelopmentContainerConfig()
            }, { importMeta: import.meta, runFromSnapshot: false })

            expect(config.image).toContain('test-docker-com/project-config-test');
            expect(config.ports).toContainEqual({ internal: 3000, external: 4000 });
            expect(config.name).toContain('dev');
            expect(config.waitFor).toBe('READY');
            expect(config.detach).toBe(true);
        });

        it('should merge runConfig env', async () => {
            const config = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
                const spine = await encapsulate({
                    '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
                        '#@stream44.studio/encapsulate/structs/Capsule': {},
                        '#': {
                            project: {
                                type: CapsulePropertyTypes.Mapping,
                                value: './Project',
                                options: {
                                    '@stream44.studio/t44-docker.com/caps/ImageContext': {
                                        '#': {
                                            organization: 'test-docker-com',
                                            repository: 'project-env-test',
                                            appBaseDir: '/tmp/test',
                                            verbose: false
                                        },
                                    },
                                    '@stream44.studio/t44-docker.com/caps/ContainerContext': {
                                        '#': {
                                            ports: [{ internal: 3000, external: 4000 }],
                                            env: {
                                                MY_VAR: 'my-value',
                                                DEBUG: 'true'
                                            },
                                        },
                                    },
                                },
                            },
                        }
                    }
                }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44-docker.com/caps/Project.test.env' })
                return { spine }
            }, async ({ spine, apis }: any) => {
                return apis[spine.capsuleSourceLineRef].project.getDevelopmentContainerConfig()
            }, { importMeta: import.meta, runFromSnapshot: false })

            expect(config.env.MY_VAR).toBe('my-value');
            expect(config.env.DEBUG).toBe('true');
        });
    });

    describe('buildDev + runDev + stopDev', () => {
        it('should build, run, verify, and stop a dev container', async () => {
            const appDir = join(workbenchDir, 'project-full-test');
            await createSampleApp(appDir);

            await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
                const spine = await encapsulate({
                    '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
                        '#@stream44.studio/encapsulate/structs/Capsule': {},
                        '#': {
                            project: {
                                type: CapsulePropertyTypes.Mapping,
                                value: './Project',
                                options: {
                                    '@stream44.studio/t44-docker.com/caps/ContainerContext': {
                                        '#': {
                                            ports: [{ internal: 3000, external: 13581 }],
                                        },
                                    },
                                    '@stream44.studio/t44-docker.com/caps/ImageContext': {
                                        '#': {
                                            organization: 'test-docker-com',
                                            repository: 'project-full-test',
                                            appBaseDir: appDir,
                                            buildContextBaseDir: join(appDir, '.~o/t44-docker.com'),
                                            verbose: false
                                        },
                                    },
                                },
                            },
                        }
                    }
                }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44-docker.com/caps/Project.test.full' })
                return { spine }
            }, async ({ spine, apis }: any) => {
                const project = apis[spine.capsuleSourceLineRef].project

                const buildResult = await project.buildDev();
                expect(buildResult.imageTag).toBeTruthy();
                expect(buildResult.imageTag).toContain('test-docker-com/project-full-test');

                const { containerId, stop, ensureRunning } = await project.runDev();
                expect(containerId).toBeTruthy();

                const isRunning = await ensureRunning();
                expect(isRunning).toBe(true);

                await stop();
                await project.image.removeImage({ image: buildResult.imageTag, force: true }).catch(() => { });
            }, { importMeta: import.meta, runFromSnapshot: false })
        }, 180000);
    });

    describe('retagImages', () => {
        it('should retag images from source to target org/repo', async () => {
            const appDir = join(workbenchDir, 'project-retag-test');
            await createSampleApp(appDir);

            await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
                const sourceSpine = await encapsulate({
                    '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
                        '#@stream44.studio/encapsulate/structs/Capsule': {},
                        '#': {
                            project: {
                                type: CapsulePropertyTypes.Mapping,
                                value: './Project',
                                options: {
                                    '@stream44.studio/t44-docker.com/caps/ImageContext': {
                                        '#': {
                                            organization: 'test-docker-com',
                                            repository: 'project-retag-source',
                                            appBaseDir: appDir,
                                            buildContextBaseDir: join(appDir, '.~o/t44-docker.com'),
                                            verbose: false
                                        },
                                    },
                                },
                            },
                        }
                    }
                }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44-docker.com/caps/Project.test.retag-source' })

                const targetSpine = await encapsulate({
                    '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
                        '#@stream44.studio/encapsulate/structs/Capsule': {},
                        '#': {
                            project: {
                                type: CapsulePropertyTypes.Mapping,
                                value: './Project',
                                options: {
                                    '@stream44.studio/t44-docker.com/caps/ImageContext': {
                                        '#': {
                                            organization: 'test-docker-com',
                                            repository: 'project-retag-target',
                                            appBaseDir: appDir,
                                            buildContextBaseDir: join(appDir, '.~o/t44-docker.com'),
                                            verbose: false
                                        },
                                    },
                                },
                            },
                        }
                    }
                }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44-docker.com/caps/Project.test.retag-target' })

                return { sourceSpine, targetSpine }
            }, async ({ sourceSpine, targetSpine, apis }: any) => {
                const sourceProject = apis[sourceSpine.capsuleSourceLineRef].project
                const targetProject = apis[targetSpine.capsuleSourceLineRef].project

                const currentArch = sourceProject.cli.getCurrentPlatformArch();
                await sourceProject.image.buildVariant({ variant: 'alpine', arch: currentArch });

                await targetProject.retagImages({ organization: 'test-docker-com', repository: 'project-retag-source' });

                const targetTags = await targetProject.image.getTags({ organization: 'test-docker-com', repository: 'project-retag-target' });
                expect(targetTags.length).toBeGreaterThan(0);

                for (const tag of targetTags) {
                    await targetProject.image.removeImage({ image: tag.tag, force: true }).catch(() => { });
                }
                const sourceTags = await sourceProject.image.getTags({ organization: 'test-docker-com', repository: 'project-retag-source' });
                for (const tag of sourceTags) {
                    await sourceProject.image.removeImage({ image: tag.tag, force: true }).catch(() => { });
                }
            }, { importMeta: import.meta, runFromSnapshot: false })
        }, 120000);
    });
});
