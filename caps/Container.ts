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
                lib: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/WorkspaceLib',
                },
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
                    value: async function (this: any, containerContext?: { name?: string; remove?: boolean; verbose?: boolean }): Promise<void> {
                        const name = containerContext?.name ?? this.context.name;
                        const remove = containerContext?.remove ?? true;
                        const verbose = containerContext?.verbose ?? this.context.verbose;
                        if (!name) return;
                        try {
                            const output = await this.containers.list({
                                all: true,
                                filter: `name=${name}`,
                                format: '{{.ID}}	{{.Names}}	{{.State}}',
                            });
                            const lines = (output as string).split('\n').filter((line: string) => line.trim());
                            for (const line of lines) {
                                const [id, cname, state] = line.trim().split('\t');
                                if (cname === name || cname === `/${name}`) {
                                    if (state === 'running') {
                                        if (verbose) console.log(`Found running container with name ${name} (ID: ${id}), stopping...`);
                                        try {
                                            await this.stop({ containerId: id });
                                            if (verbose) console.log(`✅ Stopped container: ${id}`);
                                        } catch (error) {
                                            if (verbose) console.log(`Warning: Failed to stop container ${id}: ${error}`);
                                        }
                                    }
                                    if (remove) {
                                        if (verbose) console.log(`Removing container with name ${name} (ID: ${id})...`);
                                        try {
                                            await this.remove({ containerId: id, force: true });
                                            if (verbose) console.log(`✅ Removed container: ${id}`);
                                        } catch (error) {
                                            if (verbose) console.log(`Warning: Failed to remove container ${id}: ${error}`);
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            if (verbose) console.log(`Warning: Failed to check for existing containers: ${error}`);
                        }
                    }
                },

                /**
                 * Cheap docker-state check: does a container with our
                 * `context.name` currently report `State == "running"` in
                 * `docker ps`? Protocol-agnostic — works for any container
                 * regardless of whether it speaks HTTP. Use `isServing()`
                 * when you also want to verify the process is responding on
                 * its HTTP port.
                 */
                isRunning: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, containerContext?: { name?: string }): Promise<boolean> {
                        const name = containerContext?.name ?? this.context.name;
                        if (!name) return false;
                        const output = await this.containers.list({
                            all: true,
                            filter: `name=${name}`,
                            format: '{{.Names}}\t{{.State}}',
                        });
                        const lines = (output as string).split('\n').map((l: string) => l.trim()).filter(Boolean);
                        for (const line of lines) {
                            const [cname, state] = line.split('\t');
                            const normalized = cname?.startsWith('/') ? cname.slice(1) : cname;
                            if (normalized === name && state === 'running') return true;
                        }
                        return false;
                    }
                },

                /**
                 * Wait until the container is actually *serving* on its
                 * host-exposed HTTP port. Stronger than `isRunning()` —
                 * confirms the in-container process is up and responding.
                 * Only meaningful for HTTP-speaking workloads.
                 */
                isServing: {
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

                /**
                 * Idempotently bring the container up. If it's already
                 * running, no-op. If a stopped container with the same name
                 * exists, `docker start` it (and wait for `waitFor` if set).
                 * Otherwise call `run(...)`, which creates and starts a fresh
                 * container using `containerContext` (or `this.context.derive()`).
                 *
                 * Children of Container (e.g. DatabaseServerDocker) get full
                 * idempotent startup by inheriting this method — the
                 * image-specific command flows through via `context.command`.
                 */
                ensureRunning: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, containerContext?: any): Promise<void> {
                        const ctx = containerContext ?? this.context.derive();
                        const name = ctx.name;

                        if (name) {
                            const output = await this.containers.list({
                                all: true,
                                filter: `name=${name}`,
                                format: '{{.ID}}\t{{.Names}}\t{{.State}}',
                            });
                            const lines = (output as string).split('\n').map((l: string) => l.trim()).filter(Boolean);
                            for (const line of lines) {
                                const [id, cname, state] = line.split('\t');
                                const normalized = cname?.startsWith('/') ? cname.slice(1) : cname;
                                if (normalized !== name) continue;
                                if (state === 'running') {
                                    // Already running — preserve whatever id
                                    // was captured by a previous `run()` (it
                                    // may be the long form; `docker ps`
                                    // returns the short form, which we'd
                                    // rather not overwrite with).
                                    if (!this._containerId) this._containerId = id;
                                    return;
                                }
                                // Stopped container with our name exists — resume it.
                                await this.cli.exec(['start', id]);
                                if (!this._containerId) this._containerId = id;
                                if (ctx.waitFor) {
                                    await this.waitForSignalInLogs({
                                        containerId: id,
                                        signal: ctx.waitFor,
                                        timeout: ctx.waitTimeout,
                                    });
                                }
                                return;
                            }
                        }

                        await this.run(ctx);
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
                        logCommand?: boolean;
                    }): Promise<string> {
                        const ctx = containerContext ?? this.context.derive();
                        const {
                            image, name, detach = true, ports = [], volumes = [], env = {},
                            removeOnExit: remove = false, interactive = false, tty = false,
                            workdir, network, platform, waitFor, waitTimeout = 30000,
                            showOutput = false, forceColor = true, verbose = false,
                            command, logCommand = false,
                        } = ctx;
                        const self = this;

                        let signalReceived = false;

                        const signalHandler = (signal: string) => {
                            if (verbose) console.error(`[run] Received ${signal}`);
                            signalReceived = true;
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

                            if (logCommand) {
                                // Build a copy-pasteable command with env vars inline
                                const shellArgs = args.map(arg => {
                                    // Quote args that contain spaces or special chars
                                    if (/[\s"'$`\\!]/.test(arg)) {
                                        return `'${arg.replace(/'/g, "'\\''")}'`;
                                    }
                                    return arg;
                                });
                                console.log(`\n  📋 Copy-pasteable command:\n  docker ${shellArgs.join(' ').replace(/ -d /, ' ')}\n`);
                            }

                            if (waitFor) {
                                const runResult = await self.lib.spawnProcess({
                                    cmd: ['docker', ...args],
                                    waitForExit: true,
                                });
                                if (runResult.exitCode !== 0) {
                                    throw new Error(`Failed to start container: ${runResult.stderr}`);
                                }
                                const containerId = runResult.stdout.trim();
                                if (signalReceived) { cleanup(); return containerId; }

                                // Poll docker logs instead of streaming — Bun.spawn
                                // pipes silently lose data under `bun test`.
                                const waitPattern = new RegExp(waitFor);
                                const timeoutMs = waitTimeout;
                                const startTime = Date.now();
                                const pollIntervalMs = 500;

                                while (Date.now() - startTime < timeoutMs) {
                                    if (signalReceived) { cleanup(); self._containerId = containerId; return containerId; }
                                    const logsResult = await self.lib.spawnProcess({
                                        cmd: ['docker', 'logs', containerId],
                                        waitForExit: true,
                                    });
                                    const allOutput = logsResult.stdout + '\n' + logsResult.stderr;
                                    if (showOutput || verbose) {
                                        process.stdout.write(allOutput);
                                    }
                                    if (waitPattern.test(allOutput)) {
                                        cleanup();
                                        self._containerId = containerId;
                                        return containerId;
                                    }
                                    // Check if container is still running
                                    const inspectResult = await self.lib.spawnProcess({
                                        cmd: ['docker', 'inspect', '--format', '{{.State.Running}}', containerId],
                                        waitForExit: true,
                                    });
                                    if (inspectResult.stdout.trim() === 'false') {
                                        throw new Error(`Container exited without matching pattern: ${waitFor}`);
                                    }
                                    await new Promise(r => setTimeout(r, pollIntervalMs));
                                }
                                cleanup();
                                throw new Error(`Timeout waiting for pattern: ${waitFor}`);
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
                        try {
                            const args = ['stop'];
                            if (timeout !== undefined) args.push('-t', timeout.toString());
                            args.push(containerId);
                            return await this.cli.exec(args);
                        } catch (error) {
                            // On failure, capture logs for context
                            let logsContext = '\n\nNo logs captured';
                            try {
                                const logsResult = await this.lib.spawnProcess({
                                    cmd: ['docker', 'logs', containerId],
                                    waitForExit: true,
                                });
                                const allLogs = (logsResult.stdout + '\n' + logsResult.stderr).trim();
                                if (allLogs) logsContext = `\n\nCaptured logs:\n${allLogs}`;
                            } catch {}
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            throw new Error(`Failed to stop container ${containerId}: ${errorMessage}${logsContext}`);
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
                        const startTime = Date.now();
                        const pollIntervalMs = 500;

                        while (Date.now() - startTime < timeout) {
                            const logsResult = await this.lib.spawnProcess({
                                cmd: ['docker', 'logs', containerId],
                                waitForExit: true,
                            });
                            const allOutput = logsResult.stdout + '\n' + logsResult.stderr;
                            const lines = allOutput.split('\n');

                            if (lastInstanceEndSignal) {
                                // Find the last occurrence of the end signal, then look for the signal after it
                                let lastEndIdx = -1;
                                for (let i = 0; i < lines.length; i++) {
                                    if (lines[i].indexOf(lastInstanceEndSignal) !== -1) lastEndIdx = i;
                                }
                                // Look for signal after the last end marker (or anywhere if no end marker found)
                                const searchFrom = lastEndIdx >= 0 ? lastEndIdx + 1 : 0;
                                for (let i = searchFrom; i < lines.length; i++) {
                                    if (lines[i].indexOf(signal) !== -1) return;
                                }
                            } else {
                                for (const line of lines) {
                                    if (line.indexOf(signal) !== -1) return;
                                }
                            }

                            // Check if container is still running
                            const inspectResult = await this.lib.spawnProcess({
                                cmd: ['docker', 'inspect', '--format', '{{.State.Running}}', containerId],
                                waitForExit: true,
                            });
                            if (inspectResult.stdout.trim() === 'false') {
                                throw new Error(`Container logs ended without finding signal: "${signal}"`);
                            }

                            await new Promise(r => setTimeout(r, pollIntervalMs));
                        }
                        throw new Error(`Timeout waiting for signal "${signal}" in container ${containerId} logs (${timeout}ms)`);
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
