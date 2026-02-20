export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: {
    encapsulate: any
    CapsulePropertyTypes: any
    makeImportStack: any
}) {

    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/ProjectTest',
                },

                cli: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './Cli',
                },

                image: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './Image',
                    options: { /* requires new instance */ },
                },

                container: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './Container',
                    options: { /* requires new instance */ },
                },

                // --- Project-level config ---

                dispose: {
                    type: CapsulePropertyTypes.Literal,
                    value: false as boolean,
                },

                // Internal state
                _devContainerId: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as string | undefined,
                },

                /**
                 * Get development container configuration as a derived ContainerContext plain object.
                 * Merges dev defaults (image tag, sanitized name, detach, waitFor) on top of
                 * whatever is already configured on container.context.
                 */
                getDevelopmentContainerConfig: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any): Record<string, any> {
                        const imageCtx = this.image.context;
                        const imageTag = imageCtx.getImageTag({
                            variant: imageCtx.variant || 'alpine',
                            arch: imageCtx.arch || this.cli.getCurrentPlatformArch(),
                        });
                        const sanitizedName = imageTag.replace(/[^a-zA-Z0-9_.-]/g, '-') + '-dev';

                        return this.container.context.derive({
                            image: imageTag,
                            name: sanitizedName,
                            detach: true,
                            waitFor: this.container.context.waitFor ?? 'READY',
                            waitTimeout: this.container.context.waitTimeout ?? 30000,
                            verbose: this.container.context.verbose ?? imageCtx.verbose,
                            showOutput: this.container.context.showOutput ?? imageCtx.verbose,
                        });
                    }
                },

                /**
                 * Build development image (current platform, alpine variant)
                 */
                buildDev: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options?: {
                        files?: Record<string, any>;
                        tagLatest?: boolean;
                        attestations?: { sbom?: boolean; provenance?: boolean };
                    }): Promise<{ imageTag: string }> {
                        const ctx = this.image.context;
                        const files = (ctx.files || options?.files)
                            ? { ...ctx.files, ...options?.files }
                            : undefined;

                        return await this.image.buildVariant({
                            variant: ctx.variant || 'alpine',
                            arch: this.cli.getCurrentPlatformArch(),
                            files,
                            tagLatest: options?.tagLatest,
                            attestations: options?.attestations ?? ctx.attestations,
                        });
                    }
                },

                /**
                 * Build all distribution images (all variants × all archs)
                 */
                buildDistribution: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options?: {
                        files?: Record<string, any>;
                        tagLatest?: boolean;
                        attestations?: { sbom?: boolean; provenance?: boolean };
                    }): Promise<{ imageTag: string }[]> {
                        const ctx = this.image.context;
                        const files = (ctx.files || options?.files)
                            ? { ...ctx.files, ...options?.files }
                            : undefined;

                        const results: { imageTag: string }[] = [];

                        const archKeys = ctx.arch
                            ? [ctx.arch]
                            : Object.keys(this.cli.DOCKER_ARCHS);
                        const variantKeys = ctx.variant
                            ? [ctx.variant]
                            : Object.keys(ctx.DOCKERFILE_VARIANTS);

                        for (const variantKey of variantKeys) {
                            for (const archKey of archKeys) {
                                results.push(await this.image.buildVariant({
                                    variant: variantKey,
                                    arch: archKey,
                                    files,
                                    tagLatest: options?.tagLatest,
                                    attestations: options?.attestations ?? ctx.attestations,
                                }));
                            }
                        }

                        return results;
                    }
                },

                /**
                 * Run development container (with SIGINT/SIGTERM handlers)
                 */
                runDev: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options?: { showOutput?: boolean }): Promise<{
                        containerId: string;
                        stop: () => Promise<void>;
                        ensureRunning: () => Promise<boolean>;
                    }> {
                        const containerContext = {
                            ...this.getDevelopmentContainerConfig(),
                            ...(options?.showOutput !== undefined ? { showOutput: options.showOutput } : {}),
                        };

                        let signalReceived = false;
                        let signalName = '';

                        const stop = async () => {
                            await this.container.cleanup(containerContext);
                            this._devContainerId = undefined;
                        };

                        const signalHandler = (signal: string) => {
                            console.error(`\n[runDev] Received ${signal}, stopping container...`);
                            signalReceived = true;
                            signalName = signal;
                        };

                        process.on('SIGINT', signalHandler);
                        process.on('SIGTERM', signalHandler);

                        await this.container.ensureStopped(containerContext);
                        if (containerContext.verbose) console.log(`\nRunning container from image: ${containerContext.image}...`);
                        const containerId = await this.container.run(containerContext);
                        if (containerContext.verbose) console.log(`✅ Container started: ${containerId}`);
                        this._devContainerId = containerId;

                        if (signalReceived) {
                            console.error(`[runDev] Signal ${signalName} was received during startup, stopping container...`);
                            await stop();
                            process.exit(0);
                        }

                        const ensureRunning = async () => {
                            const isRunning = await this.container.isRunning({
                                ...containerContext,
                                retryDelayMs: 2000,
                                requestTimeoutMs: 5000,
                                timeoutMs: 60000,
                            });
                            if (!isRunning) {
                                throw new Error(`Container ${containerId} failed to respond`);
                            }
                            return true;
                        };

                        const runningSignalHandler = async (signal: string) => {
                            console.error(`\n[runDev] Received ${signal}, stopping container...`);
                            await stop();
                            process.exit(0);
                        };

                        process.off('SIGINT', signalHandler);
                        process.off('SIGTERM', signalHandler);
                        process.on('SIGINT', runningSignalHandler);
                        process.on('SIGTERM', runningSignalHandler);

                        return { containerId, stop, ensureRunning };
                    }
                },

                /**
                 * Ensure dev container is running
                 */
                ensureDevRunning: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<boolean> {
                        if (!this._devContainerId) {
                            throw new Error('Container must be started first using runDev()');
                        }
                        const containerContext = this.getDevelopmentContainerConfig();
                        const isRunning = await this.container.isRunning({
                            ...containerContext,
                            retryDelayMs: 2000,
                            requestTimeoutMs: 5000,
                            timeoutMs: 60000,
                        });
                        if (!isRunning) {
                            throw new Error('Container failed to respond after 60 seconds');
                        }
                        return true;
                    }
                },

                /**
                 * Stop dev container
                 */
                stopDev: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<void> {
                        if (!this._devContainerId) {
                            throw new Error('Container must be started first using runDev()');
                        }
                        await this.container.cleanup();
                        this._devContainerId = undefined;
                    }
                },

                /**
                 * Retag images from a source org/repo to this project's org/repo
                 */
                retagImages: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { organization, repository }: { organization: string; repository: string }): Promise<void> {
                        const ctx = this.image.context;
                        if (ctx.verbose) {
                            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                            console.log(`Retagging images from ${organization}/${repository} to ${ctx.organization}/${ctx.repository}`);
                            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                        }

                        const tags = await this.image.getTags({ organization, repository });

                        if (ctx.verbose) console.log(`Found ${tags.length} tags to retag`);

                        for (const tagInfo of tags) {
                            const tagSuffix = tagInfo.tag.split(':')[1];
                            if (!tagSuffix) continue;

                            const sourceImageTag = `${organization}/${repository}:${tagSuffix}`;
                            const targetImageTag = `${ctx.organization}/${ctx.repository}:${tagSuffix}`;

                            if (ctx.verbose) console.log(`  Tagging: ${sourceImageTag} -> ${targetImageTag}`);

                            await this.cli.tagImage({ sourceImage: sourceImageTag, targetImage: targetImageTag });
                        }

                        if (ctx.verbose) console.log(`✅ Retagged ${tags.length} images`);
                    }
                },

                Dispose: {
                    type: CapsulePropertyTypes.Dispose,
                    value: async function (this: any): Promise<void> {
                        if (!this.dispose || !this._devContainerId) return;
                        try {
                            const containerContext = this.getDevelopmentContainerConfig();
                            await this.container.cleanup(containerContext);
                        } catch (error) {
                            if (this.image.context.verbose) console.log(`Warning: Failed to cleanup dev container on dispose: ${error}`);
                        }
                        this._devContainerId = undefined;
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44-docker.com/caps/Project',
    })
}
