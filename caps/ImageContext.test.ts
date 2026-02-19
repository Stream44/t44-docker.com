#!/usr/bin/env bun test

import * as bunTest from 'bun:test'
import { run } from 't44/standalone-rt'
import { join } from 'path'

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
                    value: 't44/caps/WorkspaceTest',
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
});
