#!/usr/bin/env bun test --timeout 60000

import * as bunTest from 'bun:test'
import { run } from '@stream44.studio/t44/workspace-rt'

const {
    test: { describe, it, expect },
    hub,
    imageContext,
    cli,
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
                            env: {
                                DOCKERHUB_USERNAME: { factReference: '@stream44.studio/t44-docker.com/structs/Hub/WorkspaceConnectionConfig:username' },
                                DOCKERHUB_PASSWORD: { factReference: '@stream44.studio/t44-docker.com/structs/Hub/WorkspaceConnectionConfig:password' },
                                DOCKERHUB_ORGANIZATION: { factReference: '@stream44.studio/t44-docker.com/structs/Hub/WorkspaceConnectionConfig:organization' },
                            }
                        }
                    }
                },
                hub: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './Hub',
                },
                imageContext: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './ImageContext',
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
        capsuleName: '@stream44.studio/t44-docker.com/caps/Hub.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

describe('Docker Hub Capsule', function () {

    it('should have default values', function () {
        expect(hub.verbose).toBe(false);
        expect(hub._token).toBeUndefined();
    })

    it('authenticate()', async function () {
        const token = await hub.authenticate();
        expect(token).toBeTruthy();
        expect(typeof token).toBe('string');
        expect(hub._token).toBe(token);
    })

    it('getNamespace() returns organization or username', async function () {
        const ns = await hub.getNamespace();
        expect(ns).toBeTruthy();
        expect(typeof ns).toBe('string');
    })

    it('getStats() for a public repository', async function () {
        const stats = await hub.getStats({
            repository: 'alpine',
            namespace: 'library',
        });

        expect(stats).toBeDefined();
        expect(stats.name).toBe('alpine');
        expect(stats.namespace).toBe('library');
        expect(stats.pull_count).toBeGreaterThan(0);
    })

    it('getTags() for a public repository', async function () {
        const tags = await hub.getTags({
            repository: 'alpine',
            namespace: 'library',
        });

        expect(tags).toBeArray();
        expect(tags.length).toBeGreaterThan(0);
        expect(tags).toContain('latest');
    })

    it('ensureTagged() succeeds for existing tag', async function () {
        const tag = await hub.ensureTagged({
            repository: 'alpine',
            namespace: 'library',
            tag: 'latest',
        });

        expect(tag).toBe('latest');
    })

    it('getTag() returns metadata for a specific tag', async function () {
        const tagMeta = await hub.getTag({
            repository: 'alpine',
            namespace: 'library',
            tag: 'latest',
        });

        expect(tagMeta).toBeDefined();
        expect(tagMeta.name).toBe('latest');
        expect(tagMeta.last_updated || tagMeta.tag_last_pushed || tagMeta.last_pushed).toBeTruthy();
    })

    it('ensureTagged() throws for non-existent tag', async function () {
        await expect(hub.ensureTagged({
            repository: 'alpine',
            namespace: 'library',
            tag: 'this-tag-does-not-exist-ever-12345',
        })).rejects.toThrow('not found');
    })

})

describe('ImageContext Tag Formats', function () {

    it('getImageTag() returns variant-arch format', function () {
        imageContext.organization = 'test-org';
        imageContext.repository = 'test-repo';
        const tag = imageContext.getImageTag({ variant: 'alpine', arch: 'linux-arm64' });
        expect(tag).toBe('test-org/test-repo:alpine-arm64');
    })

    it('getImageTag() maps linux-x64 to amd64', function () {
        imageContext.organization = 'test-org';
        imageContext.repository = 'test-repo';
        const tag = imageContext.getImageTag({ variant: 'alpine', arch: 'linux-x64' });
        expect(tag).toBe('test-org/test-repo:alpine-amd64');
    })

    it('getLatestImageTag() appends -latest', function () {
        imageContext.organization = 'test-org';
        imageContext.repository = 'test-repo';
        const tag = imageContext.getLatestImageTag({ variant: 'alpine', arch: 'linux-arm64' });
        expect(tag).toBe('test-org/test-repo:alpine-arm64-latest');
    })

    it('getVersionImageTag() returns VERSION-variant-arch (no v prefix)', function () {
        imageContext.organization = 'test-org';
        imageContext.repository = 'test-repo';
        const tag = imageContext.getVersionImageTag({ variant: 'alpine', arch: 'linux-arm64', version: '1.2.3' });
        expect(tag).toBe('test-org/test-repo:1.2.3-alpine-arm64');
    })

    it('getVersionImageTag() strips v prefix from version', function () {
        imageContext.organization = 'test-org';
        imageContext.repository = 'test-repo';
        const tag = imageContext.getVersionImageTag({ variant: 'alpine', arch: 'linux-arm64', version: 'v2.0.0' });
        expect(tag).toBe('test-org/test-repo:2.0.0-alpine-arm64');
    })

    it('getVersionImageTag() works for distroless/x64', function () {
        imageContext.organization = 'test-org';
        imageContext.repository = 'test-repo';
        const tag = imageContext.getVersionImageTag({ variant: 'distroless', arch: 'linux-x64', version: '0.1.0' });
        expect(tag).toBe('test-org/test-repo:0.1.0-distroless-amd64');
    })

    it('getVersionImageTag() throws without variant/arch', function () {
        imageContext.variant = undefined;
        imageContext.arch = undefined;
        expect(() => imageContext.getVersionImageTag({ version: '1.0.0' })).toThrow('variant and arch must be set');
    })

    it('getVersionImageTag() throws without version', function () {
        imageContext.organization = 'test-org';
        imageContext.repository = 'test-repo';
        expect(() => imageContext.getVersionImageTag({ variant: 'alpine', arch: 'linux-arm64', version: '' })).toThrow('version must be provided');
    })

    it('getMultiArchManifestVersionImageTag() returns VERSION-variant (arch-agnostic)', function () {
        imageContext.organization = 'test-org';
        imageContext.repository = 'test-repo';
        const tag = imageContext.getMultiArchManifestVersionImageTag({ variant: 'alpine', version: '1.0.0' });
        expect(tag).toBe('test-org/test-repo:1.0.0-alpine');
    })

    it('getMultiArchManifestVersionImageTag() strips v prefix', function () {
        imageContext.organization = 'test-org';
        imageContext.repository = 'test-repo';
        const tag = imageContext.getMultiArchManifestVersionImageTag({ variant: 'alpine', version: 'v3.0.0' });
        expect(tag).toBe('test-org/test-repo:3.0.0-alpine');
    })

    it('getMultiArchManifestVersionImageTag() works for distroless', function () {
        imageContext.organization = 'test-org';
        imageContext.repository = 'test-repo';
        const tag = imageContext.getMultiArchManifestVersionImageTag({ variant: 'distroless', version: '0.1.0' });
        expect(tag).toBe('test-org/test-repo:0.1.0-distroless');
    })

    it('getMultiArchManifestVersionImageTag() throws without variant', function () {
        imageContext.variant = undefined;
        expect(() => imageContext.getMultiArchManifestVersionImageTag({ version: '1.0.0' })).toThrow('variant must be set');
    })

    it('getMultiArchManifestVersionImageTag() throws without version', function () {
        expect(() => imageContext.getMultiArchManifestVersionImageTag({ variant: 'alpine', version: '' })).toThrow('version must be provided');
    })

    it('getMultiArchManifestLatestImageTag() returns latest-variant (arch-agnostic)', function () {
        imageContext.organization = 'test-org';
        imageContext.repository = 'test-repo';
        const tag = imageContext.getMultiArchManifestLatestImageTag({ variant: 'alpine' });
        expect(tag).toBe('test-org/test-repo:latest-alpine');
    })

    it('getMultiArchManifestLatestImageTag() works for distroless', function () {
        imageContext.organization = 'test-org';
        imageContext.repository = 'test-repo';
        const tag = imageContext.getMultiArchManifestLatestImageTag({ variant: 'distroless' });
        expect(tag).toBe('test-org/test-repo:latest-distroless');
    })

    it('getMultiArchManifestLatestImageTag() throws without variant', function () {
        imageContext.variant = undefined;
        expect(() => imageContext.getMultiArchManifestLatestImageTag()).toThrow('variant must be set');
    })

    it('getMultiArchManifestLatestImageTag() uses instance variant', function () {
        imageContext.organization = 'test-org';
        imageContext.repository = 'test-repo';
        imageContext.variant = 'distroless';
        const tag = imageContext.getMultiArchManifestLatestImageTag();
        expect(tag).toBe('test-org/test-repo:latest-distroless');
    })
})

describe('Hub Push Functions', function () {

    it('pushImage() should require cli parameter', async function () {
        await expect(hub.pushImage({ image: 'test:tag', cli: undefined }))
            .rejects.toThrow('cli capsule must be provided');
    })

    it('createAndPushManifest() should require cli parameter', async function () {
        await expect(hub.createAndPushManifest({
            manifestTag: 'test:tag',
            archImages: ['test:arm64', 'test:amd64'],
            cli: undefined,
        })).rejects.toThrow('cli capsule must be provided');
    })

    it('createAndPushManifest() should require at least one arch image', async function () {
        await expect(hub.createAndPushManifest({
            manifestTag: 'test:tag',
            archImages: [],
            cli: cli,
        })).rejects.toThrow('at least one arch-specific image');
    })

    it('pushVariantManifest() should require cli parameter', async function () {
        await expect(hub.pushVariantManifest({
            imageContext,
            variant: 'alpine',
            cli: undefined,
        })).rejects.toThrow('cli capsule must be provided');
    })

    it('pushProject() should require project parameter', async function () {
        await expect(hub.pushProject({
            project: undefined,
        })).rejects.toThrow('project capsule must be provided');
    })
})

describe('Multi-Arch Tagging Strategy', function () {

    it('local tags include arch, hub tags do not', function () {
        imageContext.organization = 'myorg';
        imageContext.repository = 'myapp';

        // Local tags (arch-specific) — used during build
        const localArm64 = imageContext.getVersionImageTag({ variant: 'alpine', arch: 'linux-arm64', version: '1.0.0' });
        const localAmd64 = imageContext.getVersionImageTag({ variant: 'alpine', arch: 'linux-x64', version: '1.0.0' });
        expect(localArm64).toBe('myorg/myapp:1.0.0-alpine-arm64');
        expect(localAmd64).toBe('myorg/myapp:1.0.0-alpine-amd64');

        // Hub tags (arch-agnostic) — used for manifest lists
        const hubVersion = imageContext.getMultiArchManifestVersionImageTag({ variant: 'alpine', version: '1.0.0' });
        const hubLatest = imageContext.getMultiArchManifestLatestImageTag({ variant: 'alpine' });
        expect(hubVersion).toBe('myorg/myapp:1.0.0-alpine');
        expect(hubLatest).toBe('myorg/myapp:latest-alpine');
    })

    it('all variant × arch combinations produce unique local tags', function () {
        imageContext.organization = 'myorg';
        imageContext.repository = 'myapp';

        const variants = Object.keys(imageContext.DOCKERFILE_VARIANTS);
        const archs = Object.keys(cli.DOCKER_ARCHS);
        const tags = new Set<string>();

        for (const variant of variants) {
            for (const arch of archs) {
                const tag = imageContext.getVersionImageTag({ variant, arch, version: '2.0.0' });
                tags.add(tag);
            }
        }

        // Each combination should produce a unique tag
        expect(tags.size).toBe(variants.length * archs.length);
    })

    it('hub version tags collapse arch into one tag per variant', function () {
        imageContext.organization = 'myorg';
        imageContext.repository = 'myapp';

        const variants = Object.keys(imageContext.DOCKERFILE_VARIANTS);
        const hubTags = new Set<string>();

        for (const variant of variants) {
            const tag = imageContext.getMultiArchManifestVersionImageTag({ variant, version: '2.0.0' });
            hubTags.add(tag);
        }

        // One tag per variant (arch-agnostic)
        expect(hubTags.size).toBe(variants.length);
    })
})
