#!/usr/bin/env bun test --timeout 120000

import * as bunTest from 'bun:test'
import { run } from '@stream44.studio/t44/standalone-rt'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'

const {
    test: { describe, it, expect, workbenchDir },
    container,
    image,
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
                container: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './Container',
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
        capsuleName: '@stream44.studio/t44-docker.com/caps/Container.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

/**
 * Create a minimal test app and build a Docker image for container tests
 */
async function buildTestImage(baseDir: string, org: string, repo: string): Promise<string> {
    await mkdir(baseDir, { recursive: true });

    await writeFile(join(baseDir, 'index.ts'), `
const server = Bun.serve({
    port: 3000,
    fetch(req) {
        return new Response("Hello from container test!");
    },
});
console.log("READY");
console.log(\`Server running on port \${server.port}\`);
`);

    await writeFile(join(baseDir, 'package.json'), JSON.stringify({
        name: 'container-test-app',
        version: '0.1.0',
        scripts: {
            start: 'bun run index.ts'
        }
    }, null, 2));

    image.context.organization = org;
    image.context.repository = repo;
    image.context.appBaseDir = baseDir;
    image.context.buildContextBaseDir = join(baseDir, '.~o/t44-docker.com');
    image.context.verbose = false;

    const currentArch = image.cli.getCurrentPlatformArch();
    const result = await image.buildVariant({ variant: 'alpine', arch: currentArch });
    return result.imageTag;
}

describe('Container Capsule', () => {

    describe('run / stop / ensureStopped', () => {
        it('should run, verify (isRunning + isServing), and stop a container', async () => {
            const appDir = join(workbenchDir, 'container-run-test');
            const imageTag = await buildTestImage(appDir, 'test-docker-com', 'container-run-test');

            // Configure container via derive() and pass to run()
            const containerContext = container.context.derive({
                image: imageTag,
                name: `t44-docker-test-${Date.now()}`,
                ports: [{ internal: 3000, external: 13579 }],
                detach: true,
                waitFor: 'READY',
                waitTimeout: 30000,
                verbose: false,
                showOutput: false,
            });
            // Ensure no leftover container from a previous run
            await container.ensureStopped(containerContext);

            // Run — stores _containerId internally
            const containerId = await container.run(containerContext);
            expect(containerId).toBeTruthy();

            // Verify docker-state liveness (protocol-agnostic)
            expect(await container.isRunning(containerContext)).toBe(true);

            // Verify HTTP-level liveness — the in-container process is serving
            const isServing = await container.isServing({
                ...containerContext,
                retryDelayMs: 1000,
                requestTimeoutMs: 5000,
                timeoutMs: 30000,
            });
            expect(isServing).toBe(true);

            // List
            const containers = await container.list(containerContext);
            expect(containers.length).toBeGreaterThan(0);

            // Stop and remove
            await container.ensureStopped(containerContext);
            expect(await container.isRunning(containerContext)).toBe(false);

            // Cleanup image
            await image.removeImage({ image: imageTag, force: true }).catch(() => { });
        }, 120000);
    });

    describe('isRunning', () => {
        it('returns false for an unknown container name', async () => {
            const ctx = container.context.derive({ name: `t44-docker-nonexistent-${Date.now()}` });
            expect(await container.isRunning(ctx)).toBe(false);
        });
    });

    describe('ensureRunning', () => {
        it('runs fresh, then no-ops, then resumes a stopped container', async () => {
            const appDir = join(workbenchDir, 'container-ensure-running-test');
            const imageTag = await buildTestImage(appDir, 'test-docker-com', 'container-ensure-running-test');

            const containerContext = container.context.derive({
                image: imageTag,
                name: `t44-docker-ensure-running-${Date.now()}`,
                ports: [{ internal: 3000, external: 13581 }],
                detach: true,
                waitFor: 'READY',
                waitTimeout: 30000,
                verbose: false,
                showOutput: false,
            });

            try {
                await container.ensureStopped(containerContext);
                expect(await container.isRunning(containerContext)).toBe(false);

                // 1. Fresh — should create + start
                await container.ensureRunning(containerContext);
                expect(await container.isRunning(containerContext)).toBe(true);
                const firstId = container.getContainerId();
                expect(firstId).toBeTruthy();

                // 2. Already running — no-op (same container id)
                await container.ensureRunning(containerContext);
                expect(await container.isRunning(containerContext)).toBe(true);
                expect(container.getContainerId()).toBe(firstId);

                // 3. Stopped (still present) — should resume via `docker start`
                await container.stop({ containerId: firstId });
                expect(await container.isRunning(containerContext)).toBe(false);

                await container.ensureRunning(containerContext);
                expect(await container.isRunning(containerContext)).toBe(true);
                // Same id, just resumed
                expect(container.getContainerId()).toBe(firstId);
            } finally {
                await container.ensureStopped(containerContext);
                await image.removeImage({ image: imageTag, force: true }).catch(() => { });
            }
        }, 180000);
    });

    describe('ensureStopped', () => {
        it('should remove existing container with same name', async () => {
            const appDir = join(workbenchDir, 'container-ensure-test');
            const imageTag = await buildTestImage(appDir, 'test-docker-com', 'container-ensure-test');

            const containerName = `t44-docker-ensure-${Date.now()}`;

            // Start a container via derive()
            const containerContext = container.context.derive({
                image: imageTag,
                name: containerName,
                ports: [{ internal: 3000, external: 13580 }],
                detach: true,
                waitFor: 'READY',
                waitTimeout: 30000,
                verbose: false,
                showOutput: false,
            });
            const containerId = await container.run(containerContext);
            expect(containerId).toBeTruthy();

            // ensureStopped should remove it
            await container.ensureStopped(containerContext);

            // Verify it's gone
            const output = await container.containers.list({
                all: true,
                filter: `name=${containerName}`,
                format: '{{.Names}}',
            });
            const lines = (output as string).split('\n').filter((l: string) => l.trim() === containerName);
            expect(lines.length).toBe(0);

            // Cleanup image
            await image.removeImage({ image: imageTag, force: true }).catch(() => { });
        }, 120000);
    });
});
