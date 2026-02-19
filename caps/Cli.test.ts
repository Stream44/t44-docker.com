#!/usr/bin/env bun test

import * as bunTest from 'bun:test'
import { run } from 't44/standalone-rt'

const {
    test: { describe, it, expect },
    cli,
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceTest',
                    options: {
                        '#': {
                            bunTest,
                            env: {}
                        }
                    }
                },
                cli: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './Cli',
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44-docker.com/caps/Cli.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

describe('Cli Capsule', () => {

    describe('Platform Utils', () => {
        it('getCurrentPlatform should return valid platform', () => {
            const platform = cli.getCurrentPlatform();
            expect(['arm64', 'amd64']).toContain(platform);
        });

        it('getCurrentPlatformArch should return valid arch key', () => {
            const archKey = cli.getCurrentPlatformArch();
            expect(['linux-arm64', 'linux-x64']).toContain(archKey);
        });

        it('getCurrentPlatformArch should match getCurrentPlatform', () => {
            const platform = cli.getCurrentPlatform();
            const archKey = cli.getCurrentPlatformArch();
            if (platform === 'arm64') {
                expect(archKey).toBe('linux-arm64');
            } else {
                expect(archKey).toBe('linux-x64');
            }
        });
    });

    describe('DOCKER_ARCHS', () => {
        it('should have correct structure', () => {
            expect(cli.DOCKER_ARCHS).toBeDefined();
            expect(cli.DOCKER_ARCHS['linux-arm64']).toBeDefined();
            expect(cli.DOCKER_ARCHS['linux-x64']).toBeDefined();

            expect(cli.DOCKER_ARCHS['linux-arm64'].archDir).toBe('linux-arm64');
            expect(cli.DOCKER_ARCHS['linux-arm64'].arch).toBe('arm64');
            expect(cli.DOCKER_ARCHS['linux-arm64'].os).toBe('linux');

            expect(cli.DOCKER_ARCHS['linux-x64'].archDir).toBe('linux-x64');
            expect(cli.DOCKER_ARCHS['linux-x64'].arch).toBe('amd64');
            expect(cli.DOCKER_ARCHS['linux-x64'].os).toBe('linux');
        });

        it('keys should match archDir values', () => {
            for (const [key, value] of Object.entries(cli.DOCKER_ARCHS) as any) {
                expect(key).toBe(value.archDir);
            }
        });
    });

    describe('exec', () => {
        it('should execute docker version', async () => {
            const result = await cli.exec(['version', '--format', '{{.Client.Version}}']);
            expect(result).toBeTruthy();
            expect(typeof result).toBe('string');
        });

        it('should execute docker info format', async () => {
            const result = await cli.exec(['info', '--format', '{{.OSType}}']);
            expect(result).toBe('linux');
        });
    });

    describe('tagImage', () => {
        it('should tag an image', async () => {
            // Pull a small image to test with
            await cli.exec(['pull', 'hello-world']);
            await cli.tagImage({
                sourceImage: 'hello-world',
                targetImage: 'test-cli-tag:latest',
            });
            // Verify the tag exists
            const result = await cli.exec(['images', 'test-cli-tag:latest', '--format', '{{.Repository}}:{{.Tag}}']);
            expect(result).toContain('test-cli-tag:latest');
            // Cleanup
            await cli.exec(['rmi', 'test-cli-tag:latest']);
        });
    });
});
