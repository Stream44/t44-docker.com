#!/usr/bin/env bun test --timeout 30000

import * as bunTest from 'bun:test'
import { run } from 't44/standalone-rt'

const {
    test: { describe, it, expect },
    containers,
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceTest',
                    options: { '#': { bunTest, env: {} } }
                },
                containers: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './Containers',
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44-docker.com/caps/Containers.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, { importMeta: import.meta })

describe('Containers Capsule', () => {

    describe('list', () => {
        it('should return a string with default format', async () => {
            const result = await containers.list({ all: true });
            expect(typeof result).toBe('string');
        });

        it('should return a string with custom format', async () => {
            const result = await containers.list({ all: true, format: '{{.ID}}' });
            expect(typeof result).toBe('string');
        });

        it('should return an array when json is true', async () => {
            const result = await containers.list({ all: true, json: true });
            expect(Array.isArray(result)).toBe(true);
        });

        it('should filter by name', async () => {
            const result = await containers.list({ all: true, filter: 'name=nonexistent-container-xyz', format: '{{.ID}}' });
            expect(typeof result).toBe('string');
            expect((result as string).trim()).toBe('');
        });
    });
});
