#!/usr/bin/env bun test

import * as bunTest from 'bun:test'
import { run } from '@stream44.studio/t44/standalone-rt'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { tmpdir } from 'os'

const {
    test: { describe, it, expect },
    imageContext,
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectTest',
                    options: {
                        '#': {
                            bunTest,
                            env: {}
                        }
                    }
                },
                imageContext: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './ImageContext',
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44-docker.com/caps/ImageContext.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

describe('ImageContext Capsule', () => {

    describe('DOCKERFILE_VARIANTS', () => {
        it('should have correct structure', () => {
            expect(imageContext.DOCKERFILE_VARIANTS).toBeDefined();
            expect(imageContext.DOCKERFILE_VARIANTS.alpine).toBeDefined();
            expect(imageContext.DOCKERFILE_VARIANTS.distroless).toBeDefined();
            expect(imageContext.DOCKERFILE_VARIANTS.alpine.dockerfile).toBe('Dockerfile.alpine');
            expect(imageContext.DOCKERFILE_VARIANTS.alpine.tagSuffix).toBe('alpine');
            expect(imageContext.DOCKERFILE_VARIANTS.distroless.dockerfile).toBe('Dockerfile.distroless');
        });
    });

    describe('getImageTag', () => {
        it('should compute correct image tag', () => {
            imageContext.organization = 'test-org';
            imageContext.repository = 'test-repo';
            const tag = imageContext.getImageTag({ variant: 'alpine', arch: 'linux-arm64' });
            expect(tag).toBe('test-org/test-repo:alpine-arm64');
        });

        it('should compute tag for x64', () => {
            imageContext.organization = 'test-org';
            imageContext.repository = 'test-repo';
            const tag = imageContext.getImageTag({ variant: 'alpine', arch: 'linux-x64' });
            expect(tag).toBe('test-org/test-repo:alpine-amd64');
        });

        it('should throw without variant/arch', () => {
            imageContext.variant = undefined;
            imageContext.arch = undefined;
            expect(() => imageContext.getImageTag()).toThrow('variant and arch must be set');
        });

        it('should use instance variant/arch when not passed as opts', () => {
            imageContext.organization = 'test-org';
            imageContext.repository = 'test-repo';
            imageContext.variant = 'alpine';
            imageContext.arch = 'linux-arm64';
            const tag = imageContext.getImageTag();
            expect(tag).toBe('test-org/test-repo:alpine-arm64');
        });
    });

    describe('getLatestImageTag', () => {
        it('should append -latest suffix', () => {
            imageContext.organization = 'test-org';
            imageContext.repository = 'test-repo';
            const tag = imageContext.getLatestImageTag({ variant: 'alpine', arch: 'linux-arm64' });
            expect(tag).toBe('test-org/test-repo:alpine-arm64-latest');
        });
    });

    describe('getBuildContextDir', () => {
        it('should compute correct build context dir from buildContextBaseDir', () => {
            imageContext.buildContextBaseDir = '/tmp/build';
            const dir = imageContext.getBuildContextDir({ variant: 'alpine' });
            expect(dir).toBe('/tmp/build/alpine');
        });

        it('should derive buildContextBaseDir from appBaseDir when not set', () => {
            imageContext.buildContextBaseDir = '';
            imageContext.appBaseDir = '/tmp/myapp';
            const dir = imageContext.getBuildContextDir({ variant: 'alpine' });
            expect(dir).toBe(join('/tmp/myapp', '.~o/t44-docker.com', 'alpine'));
        });

        it('should throw without variant', () => {
            imageContext.variant = undefined;
            expect(() => imageContext.getBuildContextDir()).toThrow('variant must be set');
        });

        it('should use instance variant when not passed as opts', () => {
            imageContext.buildContextBaseDir = '/tmp/build';
            imageContext.variant = 'distroless';
            const dir = imageContext.getBuildContextDir();
            expect(dir).toBe('/tmp/build/distroless');
        });
    });

    describe('templateDir', () => {
        it('should default to the bundled tpl directory', () => {
            expect(imageContext.templateDir).toBeTruthy();
            expect(imageContext.templateDir).toContain('Image');
            expect(imageContext.templateDir).toContain('tpl');
        });
    });

    describe('buildVariants', () => {
        it('should default to alpine:true, distroless:false', () => {
            expect(imageContext.buildVariants).toEqual({ alpine: true, distroless: false });
        });

        it('should be configurable', () => {
            imageContext.buildVariants = { alpine: true, distroless: true };
            expect(imageContext.buildVariants).toEqual({ alpine: true, distroless: true });
            imageContext.buildVariants = { alpine: true, distroless: false };
        });

        it('should allow disabling all variants', () => {
            imageContext.buildVariants = { alpine: false, distroless: false };
            expect(imageContext.buildVariants.alpine).toBe(false);
            expect(imageContext.buildVariants.distroless).toBe(false);
            imageContext.buildVariants = { alpine: true, distroless: false };
        });
    });

    describe('dockerfile', () => {
        it('should default to undefined', () => {
            expect(imageContext.dockerfile).toBeUndefined();
        });

        it('should be settable to a path', () => {
            imageContext.dockerfile = 'Dockerfile';
            expect(imageContext.dockerfile).toBe('Dockerfile');
            imageContext.dockerfile = undefined;
        });
    });

    describe('getVersion', () => {
        it('should read version from appBaseDir/package.json', async () => {
            const dir = join(tmpdir(), `imagecontext-getversion-${Date.now()}`);
            await mkdir(dir, { recursive: true });
            await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'test', version: '2.5.0' }));

            const prevAppBaseDir = imageContext.appBaseDir;
            imageContext.appBaseDir = dir;
            const version = await imageContext.getVersion();
            expect(version).toBe('2.5.0');
            imageContext.appBaseDir = prevAppBaseDir;
        });

        it('should strip v prefix from version', async () => {
            const dir = join(tmpdir(), `imagecontext-getversion-v-${Date.now()}`);
            await mkdir(dir, { recursive: true });
            await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'test', version: 'v1.0.0' }));

            const prevAppBaseDir = imageContext.appBaseDir;
            imageContext.appBaseDir = dir;
            const version = await imageContext.getVersion();
            expect(version).toBe('1.0.0');
            imageContext.appBaseDir = prevAppBaseDir;
        });

        it('should throw when appBaseDir is not set', async () => {
            const prevAppBaseDir = imageContext.appBaseDir;
            imageContext.appBaseDir = '';
            await expect(imageContext.getVersion()).rejects.toThrow('appBaseDir must be set');
            imageContext.appBaseDir = prevAppBaseDir;
        });

        it('should throw when package.json has no version field', async () => {
            const dir = join(tmpdir(), `imagecontext-getversion-noversion-${Date.now()}`);
            await mkdir(dir, { recursive: true });
            await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'test' }));

            const prevAppBaseDir = imageContext.appBaseDir;
            imageContext.appBaseDir = dir;
            await expect(imageContext.getVersion()).rejects.toThrow('no "version" field');
            imageContext.appBaseDir = prevAppBaseDir;
        });
    });

    describe('tagLatest', () => {
        it('should default to false', () => {
            expect(imageContext.tagLatest).toBe(false);
        });

        it('should be settable to true', () => {
            imageContext.tagLatest = true;
            expect(imageContext.tagLatest).toBe(true);
            imageContext.tagLatest = false;
        });
    });

    describe('tagVersion', () => {
        it('should default to false', () => {
            expect(imageContext.tagVersion).toBe(false);
        });

        it('should be settable to true', () => {
            imageContext.tagVersion = true;
            expect(imageContext.tagVersion).toBe(true);
            imageContext.tagVersion = false;
        });
    });

    describe('getVersionImageTag', () => {
        it('should compute correct version image tag (version first, no v prefix)', () => {
            imageContext.organization = 'test-org';
            imageContext.repository = 'test-repo';
            const tag = imageContext.getVersionImageTag({ variant: 'alpine', arch: 'linux-arm64', version: '1.2.3' });
            expect(tag).toBe('test-org/test-repo:1.2.3-alpine-arm64');
        });

        it('should strip v prefix from version', () => {
            imageContext.organization = 'test-org';
            imageContext.repository = 'test-repo';
            const tag = imageContext.getVersionImageTag({ variant: 'alpine', arch: 'linux-arm64', version: 'v2.0.0' });
            expect(tag).toBe('test-org/test-repo:2.0.0-alpine-arm64');
        });

        it('should compute tag for x64 architecture', () => {
            imageContext.organization = 'test-org';
            imageContext.repository = 'test-repo';
            const tag = imageContext.getVersionImageTag({ variant: 'distroless', arch: 'linux-x64', version: '0.1.0' });
            expect(tag).toBe('test-org/test-repo:0.1.0-distroless-amd64');
        });

        it('should throw without variant/arch', () => {
            imageContext.variant = undefined;
            imageContext.arch = undefined;
            expect(() => imageContext.getVersionImageTag({ version: '1.0.0' })).toThrow('variant and arch must be set');
        });

        it('should throw without version', () => {
            imageContext.organization = 'test-org';
            imageContext.repository = 'test-repo';
            expect(() => imageContext.getVersionImageTag({ variant: 'alpine', arch: 'linux-arm64', version: '' })).toThrow('version must be provided');
        });

        it('should use instance variant/arch when not passed as opts', () => {
            imageContext.organization = 'test-org';
            imageContext.repository = 'test-repo';
            imageContext.variant = 'distroless';
            imageContext.arch = 'linux-x64';
            const tag = imageContext.getVersionImageTag({ version: '3.0.0' });
            expect(tag).toBe('test-org/test-repo:3.0.0-distroless-amd64');
        });
    });

    describe('getMultiArchManifestVersionImageTag', () => {
        it('should compute arch-agnostic hub version tag', () => {
            imageContext.organization = 'test-org';
            imageContext.repository = 'test-repo';
            const tag = imageContext.getMultiArchManifestVersionImageTag({ variant: 'alpine', version: '1.0.0' });
            expect(tag).toBe('test-org/test-repo:1.0.0-alpine');
        });

        it('should strip v prefix from version', () => {
            imageContext.organization = 'test-org';
            imageContext.repository = 'test-repo';
            const tag = imageContext.getMultiArchManifestVersionImageTag({ variant: 'alpine', version: 'v2.0.0' });
            expect(tag).toBe('test-org/test-repo:2.0.0-alpine');
        });

        it('should compute for distroless variant', () => {
            imageContext.organization = 'test-org';
            imageContext.repository = 'test-repo';
            const tag = imageContext.getMultiArchManifestVersionImageTag({ variant: 'distroless', version: '0.1.0' });
            expect(tag).toBe('test-org/test-repo:0.1.0-distroless');
        });

        it('should throw without variant', () => {
            imageContext.variant = undefined;
            expect(() => imageContext.getMultiArchManifestVersionImageTag({ version: '1.0.0' })).toThrow('variant must be set');
        });

        it('should throw without version', () => {
            expect(() => imageContext.getMultiArchManifestVersionImageTag({ variant: 'alpine', version: '' })).toThrow('version must be provided');
        });

        it('should use instance variant when not passed as opts', () => {
            imageContext.organization = 'test-org';
            imageContext.repository = 'test-repo';
            imageContext.variant = 'alpine';
            const tag = imageContext.getMultiArchManifestVersionImageTag({ version: '5.0.0' });
            expect(tag).toBe('test-org/test-repo:5.0.0-alpine');
        });
    });

    describe('getMultiArchManifestLatestImageTag', () => {
        it('should compute arch-agnostic hub latest tag', () => {
            imageContext.organization = 'test-org';
            imageContext.repository = 'test-repo';
            const tag = imageContext.getMultiArchManifestLatestImageTag({ variant: 'alpine' });
            expect(tag).toBe('test-org/test-repo:latest-alpine');
        });

        it('should compute for distroless variant', () => {
            imageContext.organization = 'test-org';
            imageContext.repository = 'test-repo';
            const tag = imageContext.getMultiArchManifestLatestImageTag({ variant: 'distroless' });
            expect(tag).toBe('test-org/test-repo:latest-distroless');
        });

        it('should throw without variant', () => {
            imageContext.variant = undefined;
            expect(() => imageContext.getMultiArchManifestLatestImageTag()).toThrow('variant must be set');
        });

        it('should use instance variant when not passed as opts', () => {
            imageContext.organization = 'test-org';
            imageContext.repository = 'test-repo';
            imageContext.variant = 'distroless';
            const tag = imageContext.getMultiArchManifestLatestImageTag();
            expect(tag).toBe('test-org/test-repo:latest-distroless');
        });
    });
});
