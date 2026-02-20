#!/usr/bin/env bun test --timeout 60000

import * as bunTest from 'bun:test'
import { run } from 't44/workspace-rt'

const {
    test: { describe, it, expect },
    hub,
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/ProjectTest',
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

    it('ensureTagged() throws for non-existent tag', async function () {
        await expect(hub.ensureTagged({
            repository: 'alpine',
            namespace: 'library',
            tag: 'this-tag-does-not-exist-ever-12345',
        })).rejects.toThrow('not found');
    })

})
