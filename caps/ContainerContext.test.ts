#!/usr/bin/env bun test --timeout 30000

import * as bunTest from 'bun:test'
import { run } from 't44/standalone-rt'

const {
    test: { describe, it, expect },
    context,
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/ProjectTest',
                    options: { '#': { bunTest, env: {} } }
                },
                context: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './ContainerContext',
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44-docker.com/caps/ContainerContext.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, { importMeta: import.meta })

describe('ContainerContext Capsule', () => {

    describe('default values', () => {
        it('should have correct defaults', () => {
            expect(context.verbose).toBe(true);
            expect(context.showOutput).toBe(false);
            expect(context.image).toBe('');
            expect(context.name).toBeUndefined();
            expect(context.ports).toEqual([]);
            expect(context.volumes).toEqual([]);
            expect(context.env).toEqual({});
            expect(context.network).toBeUndefined();
            expect(context.workdir).toBeUndefined();
            expect(context.waitFor).toBeUndefined();
            expect(context.waitTimeout).toBe(30000);
            expect(context.detach).toBe(true);
            expect(context.removeOnExit).toBe(false);
        });
    });

    describe('property assignment', () => {
        it('should allow setting image and name', () => {
            context.image = 'my-org/my-repo:alpine-amd64';
            context.name = 'my-container';
            expect(context.image).toBe('my-org/my-repo:alpine-amd64');
            expect(context.name).toBe('my-container');
        });

        it('should allow setting ports and env', () => {
            context.ports = ['8080:3000', '9090:9090'];
            context.env = { NODE_ENV: 'test', DEBUG: 'true' };
            expect(context.ports).toEqual(['8080:3000', '9090:9090']);
            expect(context.env.NODE_ENV).toBe('test');
            expect(context.env.DEBUG).toBe('true');
        });

        it('should allow setting waitFor and waitTimeout', () => {
            context.waitFor = 'READY';
            context.waitTimeout = 60000;
            expect(context.waitFor).toBe('READY');
            expect(context.waitTimeout).toBe(60000);
        });
    });
});
