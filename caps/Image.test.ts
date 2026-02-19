#!/usr/bin/env bun test --timeout 120000

import * as bunTest from 'bun:test'
import { run } from 't44/standalone-rt'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'

const {
    test: { describe, it, expect, workbenchDir },
    image,
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
                image: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './Image',
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44-docker.com/caps/Image.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

/**
 * Create a minimal test app for image building tests
 */
async function createSampleApp(baseDir: string): Promise<void> {
    await mkdir(baseDir, { recursive: true });

    await writeFile(join(baseDir, 'index.ts'), `
const server = Bun.serve({
    port: 3000,
    fetch(req) {
        return new Response("Hello from test app!");
    },
});
console.log("READY");
console.log(\`Server running on port \${server.port}\`);
`);

    await writeFile(join(baseDir, 'package.json'), JSON.stringify({
        name: 'test-app',
        version: '0.1.0',
        scripts: {
            start: 'bun run index.ts'
        }
    }, null, 2));
}

describe('Image Capsule', () => {

    describe('Constants', () => {
        it('DOCKERFILE_VARIANTS should have correct structure', () => {
            expect(image.DOCKERFILE_VARIANTS).toBeDefined();
            expect(image.DOCKERFILE_VARIANTS.alpine).toBeDefined();
            expect(image.DOCKERFILE_VARIANTS.distroless).toBeDefined();
            expect(image.DOCKERFILE_VARIANTS.alpine.dockerfile).toBe('Dockerfile.alpine');
            expect(image.DOCKERFILE_VARIANTS.alpine.tagSuffix).toBe('alpine');
            expect(image.DOCKERFILE_VARIANTS.distroless.dockerfile).toBe('Dockerfile.distroless');
        });
    });

    describe('trimIndentation', () => {
        it('should trim common leading whitespace', () => {
            const input = `
                FROM node:18
                WORKDIR /app
            `;
            const result = image.trimIndentation(input);
            expect(result).toContain('FROM node:18');
            expect(result).toContain('WORKDIR /app');
            // Content lines should not have the original deep indentation
            const fromLine = result.split('\n').find((l: string) => l.includes('FROM'));
            expect(fromLine).toBe('FROM node:18');
        });

        it('should handle already-trimmed strings', () => {
            const input = 'FROM node:18\nWORKDIR /app';
            expect(image.trimIndentation(input)).toBe(input);
        });
    });

    describe('getImageTag (via image.context)', () => {
        it('should compute correct image tag', () => {
            image.context.organization = 'test-org';
            image.context.repository = 'test-repo';
            const tag = image.context.getImageTag({ variant: 'alpine', arch: 'linux-arm64' });
            expect(tag).toBe('test-org/test-repo:alpine-arm64');
        });

        it('should throw without variant/arch', () => {
            image.context.variant = undefined;
            image.context.arch = undefined;
            expect(() => image.context.getImageTag()).toThrow('variant and arch must be set');
        });
    });

    describe('getLatestImageTag (via image.context)', () => {
        it('should append -latest to image tag', () => {
            image.context.organization = 'test-org';
            image.context.repository = 'test-repo';
            const tag = image.context.getLatestImageTag({ variant: 'alpine', arch: 'linux-arm64' });
            expect(tag).toBe('test-org/test-repo:alpine-arm64-latest');
        });
    });

    describe('getBuildContextDir (via image.context)', () => {
        it('should compute correct build context dir', () => {
            image.context.buildContextBaseDir = '/tmp/build';
            const dir = image.context.getBuildContextDir({ variant: 'alpine' });
            expect(dir).toBe('/tmp/build/alpine');
        });

        it('should throw without variant', () => {
            image.context.variant = undefined;
            expect(() => image.context.getBuildContextDir()).toThrow('variant must be set');
        });
    });

    describe('buildVariant', () => {
        it('should build a Docker image for current platform', async () => {
            const appDir = join(workbenchDir, 'build-test');
            await createSampleApp(appDir);

            image.context.organization = 'test-docker-com';
            image.context.repository = 'image-build-test';
            image.context.appBaseDir = appDir;
            image.context.buildContextBaseDir = join(appDir, '.~o/t44-docker.com');
            image.context.verbose = false;

            const currentArch = image.cli.getCurrentPlatformArch();
            const result = await image.buildVariant({
                variant: 'alpine',
                arch: currentArch,
            });

            expect(result.imageTag).toBeTruthy();
            expect(result.imageTag).toContain('test-docker-com/image-build-test:alpine-');

            // Verify image exists
            const inspectResult = await image.inspectImage({ image: result.imageTag });
            expect(inspectResult).toBeTruthy();

            // Cleanup
            await image.removeImage({ image: result.imageTag, force: true });
        }, 120000);
    });

    describe('getTags', () => {
        it('should list tags for a built image', async () => {
            const appDir = join(workbenchDir, 'tags-test');
            await createSampleApp(appDir);

            image.context.organization = 'test-docker-com';
            image.context.repository = 'image-tags-test';
            image.context.appBaseDir = appDir;
            image.context.buildContextBaseDir = join(appDir, '.~o/t44-docker.com');
            image.context.verbose = false;

            const currentArch = image.cli.getCurrentPlatformArch();
            await image.buildVariant({ variant: 'alpine', arch: currentArch });

            const tags = await image.getTags({
                organization: 'test-docker-com',
                repository: 'image-tags-test',
            });

            expect(tags.length).toBeGreaterThan(0);
            expect(tags[0].tag).toContain('test-docker-com/image-tags-test');

            // Cleanup
            for (const tag of tags) {
                await image.removeImage({ image: tag.tag, force: true }).catch(() => { });
            }
        }, 120000);
    });

    describe('copySpecifiedFiles', () => {
        it('should copy JSON objects as files', async () => {
            const buildDir = join(workbenchDir, 'copy-json-test');
            const appDir = join(workbenchDir, 'copy-json-app');
            await mkdir(buildDir, { recursive: true });
            await mkdir(appDir, { recursive: true });

            await image.copySpecifiedFiles({
                filesSpec: {
                    'config.json': { port: 3000, env: 'test' },
                },
                appBaseDir: appDir,
                buildContextDir: buildDir,
                archDir: 'linux-arm64',
            });

            const configPath = join(buildDir, 'config.json');
            expect(existsSync(configPath)).toBe(true);
            const content = JSON.parse(await Bun.file(configPath).text());
            expect(content.port).toBe(3000);
            expect(content.env).toBe('test');
        });

        it('should write string content to files', async () => {
            const buildDir = join(workbenchDir, 'copy-content-test');
            const appDir = join(workbenchDir, 'copy-content-app');
            await mkdir(buildDir, { recursive: true });
            await mkdir(appDir, { recursive: true });

            await image.copySpecifiedFiles({
                filesSpec: {
                    'Dockerfile': `
                        FROM node:18
                        WORKDIR /app
                    `,
                },
                appBaseDir: appDir,
                buildContextDir: buildDir,
                archDir: 'linux-arm64',
            });

            const dockerfilePath = join(buildDir, 'Dockerfile');
            expect(existsSync(dockerfilePath)).toBe(true);
            const content = await Bun.file(dockerfilePath).text();
            expect(content).toContain('FROM node:18');
            // Should be trimmed
            expect(content).not.toMatch(/^\s{20,}FROM/m);
        });

        it('should handle callback file specs', async () => {
            const buildDir = join(workbenchDir, 'copy-callback-test');
            const appDir = join(workbenchDir, 'copy-callback-app');
            await mkdir(buildDir, { recursive: true });
            await mkdir(appDir, { recursive: true });

            await image.copySpecifiedFiles({
                filesSpec: {
                    'dynamic-config.json': ({ archDir }: any) => ({ arch: archDir }),
                },
                appBaseDir: appDir,
                buildContextDir: buildDir,
                archDir: 'linux-arm64',
            });

            const configPath = join(buildDir, 'dynamic-config.json');
            expect(existsSync(configPath)).toBe(true);
            const content = JSON.parse(await Bun.file(configPath).text());
            expect(content.arch).toBe('linux-arm64');
        });
    });
});
