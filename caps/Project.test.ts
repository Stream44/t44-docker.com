#!/usr/bin/env bun test --timeout 180000

import * as bunTest from 'bun:test'
import { describe, it, expect } from 'bun:test'
import { run } from '@stream44.studio/t44/standalone-rt'
import { join, basename } from 'path'
import { mkdir, writeFile } from 'fs/promises'

const { test: { workbenchDir } } = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectTest',
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

                project.image.context.appBaseDir = appDir;
                project.image.context.buildContextBaseDir = join(appDir, '.~o/t44-docker.com');

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

    describe('buildDev with tagLatest', () => {
        it('should tag image with -latest suffix when tagLatest is true', async () => {
            const appDir = join(workbenchDir, 'project-taglatest-test');
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
                                    '@stream44.studio/t44-docker.com/caps/ImageContext': {
                                        '#': {
                                            organization: 'test-docker-com',
                                            repository: 'project-taglatest-test',
                                            verbose: false
                                        },
                                    },
                                },
                            },
                        }
                    }
                }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44-docker.com/caps/Project.test.taglatest' })
                return { spine }
            }, async ({ spine, apis }: any) => {
                const project = apis[spine.capsuleSourceLineRef].project

                project.image.context.appBaseDir = appDir;
                project.image.context.buildContextBaseDir = join(appDir, '.~o/t44-docker.com');

                const buildResult = await project.buildDev({ tagLatest: true });
                expect(buildResult.imageTag).toBeTruthy();

                // Verify the -latest tag exists
                const latestTag = project.image.context.getLatestImageTag({
                    variant: 'alpine',
                    arch: project.cli.getCurrentPlatformArch()
                });
                const latestExists = await project.image.doesImageTagExist(latestTag);
                expect(latestExists).toBe(true);

                // Cleanup
                await project.image.removeImage({ image: buildResult.imageTag, force: true }).catch(() => { });
                await project.image.removeImage({ image: latestTag, force: true }).catch(() => { });
            }, { importMeta: import.meta, runFromSnapshot: false })
        }, 120000);
    });

    describe('buildDev with tagVersion', () => {
        it('should tag image with version from package.json when tagVersion is true', async () => {
            const appDir = join(workbenchDir, 'project-tagversion-test');
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
                                    '@stream44.studio/t44-docker.com/caps/ImageContext': {
                                        '#': {
                                            organization: 'test-docker-com',
                                            repository: 'project-tagversion-test',
                                            verbose: false
                                        },
                                    },
                                },
                            },
                        }
                    }
                }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44-docker.com/caps/Project.test.tagversion' })
                return { spine }
            }, async ({ spine, apis }: any) => {
                const project = apis[spine.capsuleSourceLineRef].project

                project.image.context.appBaseDir = appDir;
                project.image.context.buildContextBaseDir = join(appDir, '.~o/t44-docker.com');

                const buildResult = await project.buildDev({ tagVersion: true });
                expect(buildResult.imageTag).toBeTruthy();

                // Verify the version tag exists (package.json has version 0.1.0)
                const versionTag = project.image.context.getVersionImageTag({
                    variant: 'alpine',
                    arch: project.cli.getCurrentPlatformArch(),
                    version: '0.1.0'
                });
                const versionExists = await project.image.doesImageTagExist(versionTag);
                expect(versionExists).toBe(true);

                // Cleanup
                await project.image.removeImage({ image: buildResult.imageTag, force: true }).catch(() => { });
                await project.image.removeImage({ image: versionTag, force: true }).catch(() => { });
            }, { importMeta: import.meta, runFromSnapshot: false })
        }, 120000);

        it('should fail with clear error when package.json has no version', async () => {
            const appDir = join(workbenchDir, 'project-tagversion-noversion-test');
            await mkdir(appDir, { recursive: true });

            // Create package.json without version field
            await writeFile(join(appDir, 'index.ts'), `
const server = Bun.serve({
    port: 3000,
    fetch(req) {
        return new Response("Hello!");
    },
});
console.log("READY");
`);
            await writeFile(join(appDir, 'package.json'), JSON.stringify({
                name: 'no-version-app',
                scripts: { start: 'bun run index.ts' }
            }, null, 2));

            await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
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
                                            repository: 'project-tagversion-noversion-test',
                                            verbose: false
                                        },
                                    },
                                },
                            },
                        }
                    }
                }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44-docker.com/caps/Project.test.tagversion-noversion' })
                return { spine }
            }, async ({ spine, apis }: any) => {
                const project = apis[spine.capsuleSourceLineRef].project

                project.image.context.appBaseDir = appDir;
                project.image.context.buildContextBaseDir = join(appDir, '.~o/t44-docker.com');

                let errorThrown = false;
                let errorMessage = '';
                try {
                    await project.buildDev({ tagVersion: true });
                } catch (err: any) {
                    errorThrown = true;
                    errorMessage = err.message;
                }

                expect(errorThrown).toBe(true);
                expect(errorMessage).toContain('no "version" field');

                // Cleanup any images that might have been created
                const tags = await project.image.getTags({
                    organization: 'test-docker-com',
                    repository: 'project-tagversion-noversion-test'
                });
                for (const tag of tags) {
                    await project.image.removeImage({ image: tag.tag, force: true }).catch(() => { });
                }
            }, { importMeta: import.meta, runFromSnapshot: false })
        }, 120000);
    });

    describe('buildDev with tagLatest and tagVersion combined', () => {
        it('should tag image with both -latest and version tags', async () => {
            const appDir = join(workbenchDir, 'project-tagboth-test');
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
                                    '@stream44.studio/t44-docker.com/caps/ImageContext': {
                                        '#': {
                                            organization: 'test-docker-com',
                                            repository: 'project-tagboth-test',
                                            verbose: false
                                        },
                                    },
                                },
                            },
                        }
                    }
                }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44-docker.com/caps/Project.test.tagboth' })
                return { spine }
            }, async ({ spine, apis }: any) => {
                const project = apis[spine.capsuleSourceLineRef].project

                project.image.context.appBaseDir = appDir;
                project.image.context.buildContextBaseDir = join(appDir, '.~o/t44-docker.com');

                const buildResult = await project.buildDev({ tagLatest: true, tagVersion: true });
                expect(buildResult.imageTag).toBeTruthy();

                const currentArch = project.cli.getCurrentPlatformArch();

                // Verify the -latest tag exists
                const latestTag = project.image.context.getLatestImageTag({
                    variant: 'alpine',
                    arch: currentArch
                });
                const latestExists = await project.image.doesImageTagExist(latestTag);
                expect(latestExists).toBe(true);

                // Verify the version tag exists
                const versionTag = project.image.context.getVersionImageTag({
                    variant: 'alpine',
                    arch: currentArch,
                    version: '0.1.0'
                });
                const versionExists = await project.image.doesImageTagExist(versionTag);
                expect(versionExists).toBe(true);

                // Cleanup
                await project.image.removeImage({ image: buildResult.imageTag, force: true }).catch(() => { });
                await project.image.removeImage({ image: latestTag, force: true }).catch(() => { });
                await project.image.removeImage({ image: versionTag, force: true }).catch(() => { });
            }, { importMeta: import.meta, runFromSnapshot: false })
        }, 120000);
    });

    describe('buildDistribution with buildVariants', () => {
        it('should only build enabled variants (alpine only by default)', async () => {
            const appDir = join(workbenchDir, 'project-buildvariants-test');
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
                                    '@stream44.studio/t44-docker.com/caps/ImageContext': {
                                        '#': {
                                            organization: 'test-docker-com',
                                            repository: 'project-buildvariants-test',
                                            verbose: false
                                        },
                                    },
                                },
                            },
                        }
                    }
                }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44-docker.com/caps/Project.test.buildvariants' })
                return { spine }
            }, async ({ spine, apis }: any) => {
                const project = apis[spine.capsuleSourceLineRef].project

                project.image.context.appBaseDir = appDir;
                project.image.context.buildContextBaseDir = join(appDir, '.~o/t44-docker.com');

                // Default buildVariants: { alpine: true, distroless: false }
                const results = await project.buildDistribution();

                // Should only build alpine (not distroless), for all archs
                const archCount = Object.keys(project.cli.DOCKER_ARCHS).length;
                expect(results.length).toBe(archCount);
                for (const result of results) {
                    expect(result.imageTag).toContain('alpine');
                    expect(result.imageTag).not.toContain('distroless');
                }

                // Cleanup
                for (const result of results) {
                    await project.image.removeImage({ image: result.imageTag, force: true }).catch(() => { });
                }
            }, { importMeta: import.meta, runFromSnapshot: false })
        }, 120000);

        it('should build both variants when both enabled', async () => {
            const appDir = join(workbenchDir, 'project-buildvariants-both-test');
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
                                    '@stream44.studio/t44-docker.com/caps/ImageContext': {
                                        '#': {
                                            organization: 'test-docker-com',
                                            repository: 'project-buildvariants-both-test',
                                            buildVariants: { alpine: true, distroless: true },
                                            verbose: false
                                        },
                                    },
                                },
                            },
                        }
                    }
                }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44-docker.com/caps/Project.test.buildvariants-both' })
                return { spine }
            }, async ({ spine, apis }: any) => {
                const project = apis[spine.capsuleSourceLineRef].project

                project.image.context.appBaseDir = appDir;
                project.image.context.buildContextBaseDir = join(appDir, '.~o/t44-docker.com');

                const results = await project.buildDistribution();

                // Should build both variants for all archs
                const archCount = Object.keys(project.cli.DOCKER_ARCHS).length;
                const variantCount = 2;
                expect(results.length).toBe(archCount * variantCount);

                const alpineResults = results.filter((r: any) => r.imageTag.includes('alpine'));
                const distrolessResults = results.filter((r: any) => r.imageTag.includes('distroless'));
                expect(alpineResults.length).toBe(archCount);
                expect(distrolessResults.length).toBe(archCount);

                // Cleanup
                for (const result of results) {
                    await project.image.removeImage({ image: result.imageTag, force: true }).catch(() => { });
                }
            }, { importMeta: import.meta, runFromSnapshot: false })
        }, 180000);
    });

    describe('buildMultiPlatform with arch-dependent files', () => {
        it('should call files callback with correct archDir per architecture', async () => {
            const appDir = join(workbenchDir, 'project-multiplatform-archfiles-test');
            await createSampleApp(appDir);

            // Create arch-specific marker files so we can verify each image gets the right one
            const archDirs = ['linux-arm64', 'linux-x64'];
            for (const archDir of archDirs) {
                const dir = join(appDir, 'dist', archDir);
                await mkdir(dir, { recursive: true });
                await writeFile(join(dir, 'marker'), `arch=${archDir}\n`);
            }

            await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
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
                                            repository: 'multiplatform-archfiles-test',
                                            verbose: true,
                                            files: {
                                                'marker': ({ appBaseDir, archDir }: any) => {
                                                    const p = join(appBaseDir, 'dist', archDir, 'marker');
                                                    console.log(`  [files callback] archDir=${archDir} -> ${p}`);
                                                    return p;
                                                },
                                                'package.json': { scripts: { start: 'cat /app/marker' } },
                                            },
                                        },
                                    },
                                },
                            },
                        }
                    }
                }, { importMeta: import.meta, importStack: makeImportStack(), capsuleName: '@stream44.studio/t44-docker.com/caps/Project.test.multiplatform-archfiles' })
                return { spine }
            }, async ({ spine, apis }: any) => {
                const project = apis[spine.capsuleSourceLineRef].project;

                project.image.context.appBaseDir = appDir;
                project.image.context.buildContextBaseDir = join(appDir, '.~o/t44-docker.com');

                // buildMultiPlatform builds each arch via buildVariant
                const result = await project.image.buildMultiPlatform({
                    variant: 'alpine',
                    tags: ['test-docker-com/multiplatform-archfiles-test:test-multiarch'],
                    push: false,
                });

                expect(result.tags.length).toBe(1);

                // Verify each per-arch image contains the correct marker file
                const archExpectations: Record<string, string> = {
                    'linux-arm64': 'arch=linux-arm64',
                    'linux-x64': 'arch=linux-x64',
                };

                for (const [archKey, expectedContent] of Object.entries(archExpectations)) {
                    const archInfo = project.cli.DOCKER_ARCHS[archKey];
                    const imageTag = project.image.context.getImageTag({ variant: 'alpine', arch: archKey });
                    console.log(`  Checking ${imageTag} (${archInfo.arch}) for: ${expectedContent}`);

                    const output = await project.cli.exec([
                        'run', '--rm',
                        '--platform', `${archInfo.os}/${archInfo.arch}`,
                        '--entrypoint', '/bin/cat',
                        imageTag,
                        '/app/marker',
                    ]);
                    expect(output.trim()).toBe(expectedContent);
                }

                // Cleanup
                for (const archKey of Object.keys(project.cli.DOCKER_ARCHS)) {
                    const imageTag = project.image.context.getImageTag({ variant: 'alpine', arch: archKey });
                    await project.image.removeImage({ image: imageTag, force: true }).catch(() => { });
                }
                await project.cli.exec(['rmi', 'test-docker-com/multiplatform-archfiles-test:test-multiarch']).catch(() => { });
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

                sourceProject.image.context.appBaseDir = appDir;
                sourceProject.image.context.buildContextBaseDir = join(appDir, '.~o/t44-docker.com');
                targetProject.image.context.appBaseDir = appDir;
                targetProject.image.context.buildContextBaseDir = join(appDir, '.~o/t44-docker.com');

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
