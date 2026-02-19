import { waitForFetch } from '../lib/waitForFetch'

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
                cli: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './Cli',
                },

                context: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './ContainerContext',
                    options: { /* requires new instance */ },
                },

                containers: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './Containers',
                },

                // Internal state
                _containerId: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as string | undefined,
                },

                // --- Lifecycle helpers ---

                ensureStopped: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, containerContext?: { name?: string; verbose?: boolean }): Promise<void> {
                        const name = containerContext?.name ?? this.context.name;
                        const verbose = containerContext?.verbose ?? this.context.verbose;
                        if (!name) return;
                        try {
                            const output = await this.containers.list({
                                all: true,
                                filter: `name=${name}`,
                                format: '{{.ID}}\t{{.Names}}',
                            });
                            const lines = (output as string).split('\n').filter((line: string) => line.trim());
                            for (const line of lines) {
                                const [id, cname] = line.trim().split('\t');
                                if (cname === name || cname === `/${name}`) {
                                    if (verbose) console.log(`Found existing container with name ${name} (ID: ${id}), removing...`);
                                    try {
                                        await this.remove({ containerId: id, force: true });
                                        if (verbose) console.log(`✅ Removed existing container: ${id}`);
                                    } catch (error) {
                                        if (verbose) console.log(`Warning: Failed to remove container ${id}: ${error}`);
                                    }
                                }
                            }
                        } catch (error) {
                            if (verbose) console.log(`Warning: Failed to check for existing containers: ${error}`);
                        }
                    }
                },

                isRunning: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, containerContext?: { ports?: { internal: number; external: number }[]; verbose?: boolean; retryDelayMs?: number; requestTimeoutMs?: number; timeoutMs?: number }): Promise<boolean> {
                        if (!this._containerId) return false;
                        const ports = containerContext?.ports ?? this.context.ports;
                        const verbose = containerContext?.verbose ?? this.context.verbose;
                        let hostPort: number | undefined;
                        if (ports.length > 0) {
                            hostPort = ports[0].external;
                        }
                        if (!hostPort) throw new Error('Cannot verify container health: no ports in containerContext');
                        return await waitForFetch({
                            url: `http://localhost:${hostPort}`,
                            status: true,
                            retryDelayMs: containerContext?.retryDelayMs ?? 1000,
                            requestTimeoutMs: containerContext?.requestTimeoutMs ?? 2000,
                            timeoutMs: containerContext?.timeoutMs ?? 30000,
                            verbose,
                        }) as boolean;
                    }
                },

                list: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, containerContext?: { image?: string }): Promise<any[]> {
                        const image = containerContext?.image ?? this.context.image;
                        const output = await this.containers.list({
                            all: true,
                            filter: `ancestor=${image}`,
                            format: '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}',
                        });
                        const containers: any[] = [];
                        for (const line of (output as string).split('\n')) {
                            const trimmed = line.trim();
                            if (!trimmed) continue;
                            const [id, name, img, status, ports] = trimmed.split('\t');
                            if (!id || !name) continue;
                            containers.push({ id, name, image: img || '', status: status || '', ports: ports || '' });
                        }
                        return containers;
                    }
                },

                cleanup: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, containerContext?: { containerId?: string; force?: boolean; verbose?: boolean }): Promise<void> {
                        const containerId = containerContext?.containerId ?? this._containerId;
                        const verbose = containerContext?.verbose ?? this.context.verbose;
                        if (!containerId) return;
                        try { await this.stop({ containerId }); } catch (error) {
                            if (verbose) console.log(`Warning: Failed to stop container: ${error}`);
                        }
                        try { await this.remove({ containerId, force: containerContext?.force ?? true }); } catch (error) {
                            if (verbose) console.log(`Warning: Failed to remove container: ${error}`);
                        }
                    }
                },

                getContainerId: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any): string | undefined { return this._containerId; }
                },

                // --- Docker CLI methods ---
                // Each accepts an optional containerContext (plain object from context.derive()).
                // When omitted, this.context is used as the source of config.

                /**
                 * Run a Docker container.
                 * Pass a derived context object to override config without mutating this.context.
                 */
                run: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, containerContext?: {
                        image?: string;
                        name?: string;
                        detach?: boolean;
                        ports?: { internal: number; external: number }[];
                        volumes?: string[];
                        env?: Record<string, string>;
                        removeOnExit?: boolean;
                        interactive?: boolean;
                        tty?: boolean;
                        workdir?: string;
                        network?: string;
                        platform?: string;
                        waitFor?: string;
                        waitTimeout?: number;
                        showOutput?: boolean;
                        forceColor?: boolean;
                        verbose?: boolean;
                        command?: string;
                    }): Promise<string> {
                        const ctx = containerContext ?? this.context.derive();
                        const {
                            image, name, detach = true, ports = [], volumes = [], env = {},
                            removeOnExit: remove = false, interactive = false, tty = false,
                            workdir, network, platform, waitFor, waitTimeout = 30000,
                            showOutput = false, forceColor = true, verbose = false,
                            command,
                        } = ctx;
                        const self = this;

                        let containerProc: ReturnType<typeof Bun.spawn> | null = null;
                        let logsProc: ReturnType<typeof Bun.spawn> | null = null;
                        let signalReceived = false;

                        const signalHandler = (signal: string) => {
                            if (verbose) console.error(`[run] Received ${signal}, killing spawned processes...`);
                            signalReceived = true;
                            if (containerProc && containerProc.exitCode === null) containerProc.kill();
                            if (logsProc && logsProc.exitCode === null) logsProc.kill();
                        };
                        const sigintHandler = () => signalHandler('SIGINT');
                        const sigtermHandler = () => signalHandler('SIGTERM');
                        process.on('SIGINT', sigintHandler);
                        process.on('SIGTERM', sigtermHandler);
                        const cleanup = () => {
                            process.off('SIGINT', sigintHandler);
                            process.off('SIGTERM', sigtermHandler);
                        };

                        try {
                            const args = ['run'];
                            if (detach) args.push('-d');
                            if (remove) args.push('--rm');
                            if (interactive) args.push('-i');
                            if (tty) args.push('-t');
                            if (name) args.push('--name', name);
                            if (workdir) args.push('-w', workdir);
                            if (network) args.push('--network', network);
                            if (platform) args.push('--platform', platform);
                            for (const port of ports) args.push('-p', `${port.external}:${port.internal}`);
                            for (const volume of volumes) args.push('-v', volume);
                            const finalEnv = { ...env };
                            if (forceColor && !finalEnv.FORCE_COLOR) finalEnv.FORCE_COLOR = '1';
                            for (const [key, val] of Object.entries(finalEnv)) args.push('-e', `${key}=${val}`);
                            args.push(image);

                            if (command) {
                                const commandParts: string[] = [];
                                let current = '';
                                let inQuotes = false;
                                let quoteChar = '';
                                let escaped = false;
                                for (let i = 0; i < command.length; i++) {
                                    const char = command[i];
                                    if (escaped) { current += char; escaped = false; continue; }
                                    if (char === '\\') { escaped = true; current += char; continue; }
                                    if ((char === '"' || char === "'") && !inQuotes) { inQuotes = true; quoteChar = char; }
                                    else if (char === quoteChar && inQuotes) { inQuotes = false; quoteChar = ''; }
                                    else if (char === ' ' && !inQuotes) { if (current) { commandParts.push(current); current = ''; } }
                                    else { current += char; }
                                }
                                if (current) commandParts.push(current);
                                args.push(...commandParts);
                            }

                            if (verbose) console.log(`[run] Full command: docker ${args.join(' ')}`);

                            if (waitFor) {
                                containerProc = Bun.spawn(['docker', ...args], { stdout: 'pipe', stderr: 'pipe' });
                                const proc = containerProc;
                                const result = await new Response(proc.stdout as any).text();
                                await proc.exited;
                                if (proc.exitCode !== 0) {
                                    const error = await new Response(proc.stderr as any).text();
                                    throw new Error(`Failed to start container: ${error}`);
                                }
                                const containerId = result.trim();
                                if (signalReceived) { cleanup(); return containerId; }

                                logsProc = Bun.spawn(['docker', 'logs', '--tail', '100000', '-f', containerId], { stdout: 'pipe', stderr: 'pipe' });
                                const waitPattern = new RegExp(waitFor);
                                const timeoutMs = waitTimeout;

                                try {
                                    const decoder = new TextDecoder();
                                    let patternFoundFlag = false;
                                    let resolvePattern: (() => void) | null = null;
                                    const patternPromise = new Promise<void>((resolve) => { resolvePattern = resolve; });

                                    const processStream = async (stream: ReadableStream<Uint8Array>, streamName: string, continueAfterPattern: boolean = false) => {
                                        const reader = stream.getReader();
                                        let buffer = '';
                                        try {
                                            while (true) {
                                                const { done, value } = await reader.read();
                                                if (done) {
                                                    if (buffer && (showOutput || verbose)) Bun.write(Bun.stdout, `[container:${streamName}] ${buffer}\n`);
                                                    break;
                                                }
                                                buffer += decoder.decode(value, { stream: true });
                                                const lines = buffer.split('\n');
                                                buffer = lines.pop() || '';
                                                for (const line of lines) {
                                                    if (showOutput || verbose) Bun.write(Bun.stdout, `[container:${streamName}] ${line}\n`);
                                                    if (!patternFoundFlag && waitPattern.test(line)) {
                                                        patternFoundFlag = true;
                                                        if (resolvePattern) resolvePattern();
                                                        if (!continueAfterPattern) return;
                                                    }
                                                }
                                            }
                                        } finally { reader.releaseLock(); }
                                    };

                                    const continueAfterPattern = showOutput || verbose;
                                    const streamProcessing = Promise.all([
                                        processStream(logsProc.stdout as any, 'stdout', continueAfterPattern),
                                        processStream(logsProc.stderr as any, 'stderr', continueAfterPattern),
                                    ]);
                                    const timeout = new Promise<void>((_, reject) => {
                                        setTimeout(() => reject(new Error(`Timeout waiting for pattern: ${waitFor}`)), timeoutMs);
                                    });

                                    await Promise.race([
                                        patternPromise,
                                        streamProcessing.then(() => {
                                            if (!patternFoundFlag && !signalReceived) {
                                                throw new Error(`Container exited without matching pattern: ${waitFor}`);
                                            }
                                        }),
                                        timeout,
                                    ]);

                                    if (signalReceived) { if (logsProc) logsProc.kill(); cleanup(); self._containerId = containerId; return containerId; }

                                    if (continueAfterPattern) {
                                        streamProcessing.catch((err) => console.error(`[run] Error in background log monitoring:`, err));
                                    } else {
                                        if (logsProc) logsProc.kill();
                                    }
                                    cleanup();
                                    self._containerId = containerId;
                                    return containerId;
                                } catch (error) {
                                    if (logsProc) logsProc.kill();
                                    cleanup();
                                    throw error;
                                }
                            }

                            const result = await this.cli.exec(args);
                            cleanup();
                            self._containerId = result;
                            return result;
                        } catch (err) {
                            cleanup();
                            throw err;
                        }
                    }
                },

                stop: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, containerContext?: { containerId: string; timeout?: number }): Promise<string> {
                        const containerId = containerContext?.containerId ?? this._containerId;
                        if (!containerId) throw new Error('No containerId: container has not been started');
                        const timeout = containerContext?.timeout;
                        const logsProc = Bun.spawn(['docker', 'logs', '-f', containerId], { stdout: 'pipe', stderr: 'pipe' });
                        const capturedLogs: string[] = [];
                        const decoder = new TextDecoder();
                        const collectLogs = async (stream: ReadableStream<Uint8Array>, streamName: string) => {
                            const reader = stream.getReader();
                            let buffer = '';
                            try {
                                while (true) {
                                    const { done, value } = await reader.read();
                                    if (done) break;
                                    buffer += decoder.decode(value, { stream: true });
                                    const lines = buffer.split('\n');
                                    buffer = lines.pop() || '';
                                    for (const line of lines) {
                                        capturedLogs.push(`[${streamName}] ${line}`);
                                        if (this.context.verbose) Bun.write(Bun.stdout, `[stop:${streamName}] ${line}\n`);
                                    }
                                }
                                if (buffer) {
                                    capturedLogs.push(`[${streamName}] ${buffer}`);
                                    if (this.context.verbose) Bun.write(Bun.stdout, `[stop:${streamName}] ${buffer}\n`);
                                }
                            } finally { reader.releaseLock(); }
                        };
                        const logsCollection = Promise.all([
                            collectLogs(logsProc.stdout as any, 'stdout'),
                            collectLogs(logsProc.stderr as any, 'stderr'),
                        ]);
                        try {
                            const args = ['stop'];
                            if (timeout !== undefined) args.push('-t', timeout.toString());
                            args.push(containerId);
                            return await this.cli.exec(args);
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            const logsContext = capturedLogs.length > 0
                                ? `\n\nCaptured logs:\n${capturedLogs.join('\n')}`
                                : '\n\nNo logs captured';
                            throw new Error(`Failed to stop container ${containerId}: ${errorMessage}${logsContext}`);
                        } finally {
                            logsProc.kill();
                            await Promise.race([logsCollection, new Promise(resolve => setTimeout(resolve, 1000))]);
                        }
                    }
                },

                remove: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, containerContext?: { containerId: string; force?: boolean; volumes?: boolean }): Promise<string> {
                        const containerId = containerContext?.containerId ?? this._containerId;
                        if (!containerId) throw new Error('No containerId: container has not been started');
                        const args = ['rm'];
                        if (containerContext?.force) args.push('-f');
                        if (containerContext?.volumes) args.push('-v');
                        args.push(containerId);
                        return await this.cli.exec(args);
                    }
                },

                start: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, containerContext: { containerId: string }): Promise<string> {
                        return await this.cli.exec(['start', containerContext.containerId]);
                    }
                },

                waitForSignalInLogs: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, containerContext: {
                        containerId: string; signal: string; timeout?: number; lastInstanceEndSignal?: string;
                    }): Promise<void> {
                        const { containerId, signal, timeout = 30000, lastInstanceEndSignal } = containerContext;
                        const logsProc = Bun.spawn(['docker', 'logs', '--tail', 'all', '-f', containerId], { stdout: 'pipe', stderr: 'pipe' });
                        const decoder = new TextDecoder();
                        let signalFound = false;
                        let lastInstanceEnded = lastInstanceEndSignal ? false : true;
                        let pendingSignalTimeout: Timer | null = null;
                        let resolveSignal: (() => void) | null = null;
                        const signalPromise = new Promise<void>((resolve) => { resolveSignal = resolve; });

                        const processStream = async (stream: ReadableStream<Uint8Array>, streamName: string) => {
                            const reader = stream.getReader();
                            let buffer = '';
                            try {
                                while (true) {
                                    if (signalFound) break;
                                    const { done, value } = await reader.read();
                                    if (done) break;
                                    buffer += decoder.decode(value, { stream: true });
                                    const lines = buffer.split('\n');
                                    buffer = lines.pop() || '';
                                    for (const line of lines) {
                                        if (this.context.verbose) console.log(`[waitForSignalInLogs:${streamName}] ${line}`);
                                        if (lastInstanceEndSignal && line.indexOf(lastInstanceEndSignal) !== -1) {
                                            if (pendingSignalTimeout) { clearTimeout(pendingSignalTimeout); pendingSignalTimeout = null; }
                                            lastInstanceEnded = true;
                                            continue;
                                        }
                                        if (!signalFound && line.indexOf(signal) !== -1) {
                                            if (lastInstanceEndSignal && !lastInstanceEnded) {
                                                signalFound = true;
                                                if (resolveSignal) resolveSignal();
                                                break;
                                            } else if (lastInstanceEndSignal && lastInstanceEnded) {
                                                if (pendingSignalTimeout) clearTimeout(pendingSignalTimeout);
                                                pendingSignalTimeout = setTimeout(() => {
                                                    signalFound = true;
                                                    if (resolveSignal) resolveSignal();
                                                }, 100);
                                            } else {
                                                signalFound = true;
                                                if (resolveSignal) resolveSignal();
                                                break;
                                            }
                                        }
                                    }
                                    if (signalFound) break;
                                }
                                if (buffer && !signalFound && buffer.indexOf(signal) !== -1) {
                                    signalFound = true;
                                    if (resolveSignal) resolveSignal();
                                }
                            } finally { reader.releaseLock(); }
                        };

                        const streamProcessing = Promise.all([
                            processStream(logsProc.stdout as any, 'stdout'),
                            processStream(logsProc.stderr as any, 'stderr'),
                        ]);
                        const timeoutPromise = new Promise<void>((_, reject) => {
                            setTimeout(() => reject(new Error(`Timeout waiting for signal "${signal}" in container ${containerId} logs (${timeout}ms)`)), timeout);
                        });
                        try {
                            await Promise.race([
                                signalPromise,
                                streamProcessing.then(() => {
                                    if (!signalFound) throw new Error(`Container logs ended without finding signal: "${signal}"`);
                                }),
                                timeoutPromise,
                            ]);
                        } finally {
                            logsProc.kill();
                        }
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44-docker.com/caps/Container',
    })
}
