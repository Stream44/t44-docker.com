/**
 * Docker Hub API Capsule
 * @see https://docs.docker.com/docker-hub/api/latest/
 */

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
            '#@stream44.studio/t44-docker.com/structs/Hub/WorkspaceConnectionConfig': {
                as: '$ConnectionConfig'
            },
            '#': {

                verbose: {
                    type: CapsulePropertyTypes.Literal,
                    value: false,
                },

                _token: {
                    type: CapsulePropertyTypes.Literal,
                    value: undefined as string | undefined,
                },

                /**
                 * Get the namespace (organization or username)
                 */
                getNamespace: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<string> {
                        const org = await this.$ConnectionConfig.getConfigValue('organization').catch(() => undefined);
                        const username = await this.$ConnectionConfig.getConfigValue('username');
                        return org || username;
                    }
                },

                /**
                 * Authenticate with Docker Hub and get a JWT token
                 */
                authenticate: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<string> {
                        const username = await this.$ConnectionConfig.getConfigValue('username');
                        const password = await this.$ConnectionConfig.getConfigValue('password');

                        if (this.verbose) {
                            console.log(`[Hub] Authenticating as ${username}`);
                        }

                        const response = await fetch('https://hub.docker.com/v2/users/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                username,
                                password,
                            }),
                        });

                        if (!response.ok) {
                            const error = await response.text();
                            throw new Error(`Docker Hub authentication failed: ${response.status} ${error}`);
                        }

                        const data = await response.json() as { token?: string };
                        this._token = data.token;

                        if (!this._token) {
                            throw new Error('Docker Hub authentication failed: No token received');
                        }

                        if (this.verbose) {
                            console.log(`[Hub] Authentication successful`);
                        }

                        return this._token;
                    }
                },

                /**
                 * Ensure we have a valid token
                 */
                ensureAuthenticated: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<string> {
                        if (!this._token) {
                            await this.authenticate();
                        }
                        return this._token!;
                    }
                },

                /**
                 * Internal helper to make API calls to Docker Hub
                 */
                apiCall: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        method: 'GET' | 'POST' | 'DELETE';
                        path: string;
                        requireAuth?: boolean;
                        body?: any;
                    }): Promise<any> {
                        const { method, path, requireAuth = true, body } = options;

                        const headers: Record<string, string> = {};

                        if (requireAuth) {
                            const token = await this.ensureAuthenticated();
                            headers['Authorization'] = `JWT ${token}`;
                        } else if (this._token) {
                            headers['Authorization'] = `JWT ${this._token}`;
                        }

                        if (body) {
                            headers['Content-Type'] = 'application/json';
                        }

                        const url = `https://hub.docker.com${path}`;

                        if (this.verbose) {
                            console.log(`[Hub] ${method} ${path}`);
                        }

                        const response = await fetch(url, {
                            method,
                            headers,
                            body: body ? JSON.stringify(body) : undefined,
                        });

                        if (!response.ok) {
                            const error = await response.text();
                            throw new Error(`API call failed: ${method} ${path} - ${response.status} ${error}`);
                        }

                        if (method === 'DELETE') {
                            return {};
                        }

                        return await response.json();
                    }
                },

                /**
                 * Get all tags in a repository
                 */
                getTags: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        repository: string;
                        namespace?: string;
                    }): Promise<string[]> {
                        const namespace = options.namespace || this.getNamespace();
                        const repository = options.repository;

                        const data = await this.apiCall({
                            method: 'GET',
                            path: `/v2/repositories/${namespace}/${repository}/tags/?page_size=100`,
                        });

                        return data.results?.map((result: any) => result.name) || [];
                    }
                },

                /**
                 * Verify that a tag exists in the repository
                 */
                ensureTagged: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        repository: string;
                        tag: string;
                        namespace?: string;
                    }): Promise<string> {
                        const tags = await this.getTags({
                            repository: options.repository,
                            namespace: options.namespace,
                        });

                        if (!tags.includes(options.tag)) {
                            throw new Error(`Tag ${options.tag} not found in repository`);
                        }

                        return options.tag;
                    }
                },

                /**
                 * Get repository statistics including pull count, star count, etc.
                 */
                getStats: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        repository: string;
                        namespace?: string;
                    }): Promise<{
                        pull_count: number;
                        star_count: number;
                        name: string;
                        namespace: string;
                        description: string;
                        is_private: boolean;
                        last_updated: string;
                    }> {
                        const namespace = options.namespace || this.getNamespace();
                        const repository = options.repository;

                        const data = await this.apiCall({
                            method: 'GET',
                            path: `/v2/repositories/${namespace}/${repository}/`,
                            requireAuth: false,
                        });

                        return {
                            pull_count: data.pull_count || 0,
                            star_count: data.star_count || 0,
                            name: data.name,
                            namespace: data.namespace,
                            description: data.description || '',
                            is_private: data.is_private || false,
                            last_updated: data.last_updated,
                        };
                    }
                },

                /**
                 * Delete a specific tag from a repository
                 */
                deleteTag: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        repository: string;
                        tag: string;
                        namespace?: string;
                        timeoutMs?: number;
                        pollIntervalMs?: number;
                    }): Promise<void> {
                        const namespace = options.namespace || this.getNamespace();
                        const repository = options.repository;
                        const tag = options.tag;
                        const timeoutMs = options.timeoutMs ?? 30000;
                        const pollIntervalMs = options.pollIntervalMs ?? 2000;

                        if (this.verbose) {
                            console.log(`[Hub] Deleting tag ${namespace}/${repository}:${tag}`);
                        }

                        try {
                            await this.apiCall({
                                method: 'DELETE',
                                path: `/v2/repositories/${namespace}/${repository}/tags/${tag}/`,
                            });
                        } catch (error: any) {
                            if (error?.message?.includes('403')) {
                                throw new Error('Tag deletion not permitted: token lacks delete permissions');
                            }
                            throw error;
                        }

                        // Poll to verify deletion
                        const startTime = Date.now();
                        while (Date.now() - startTime < timeoutMs) {
                            const tags = await this.getTags({ repository, namespace });
                            if (!tags.includes(tag)) {
                                if (this.verbose) {
                                    console.log(`[Hub] Tag deleted successfully`);
                                }
                                return;
                            }
                            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
                        }

                        throw new Error(`Tag deletion verification timed out after ${timeoutMs}ms`);
                    }
                },

                /**
                 * Delete an entire repository from Docker Hub
                 */
                deleteRepository: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        repository: string;
                        namespace?: string;
                        wait?: boolean;
                        timeoutMs?: number;
                        pollIntervalMs?: number;
                    }): Promise<void> {
                        const namespace = options.namespace || this.getNamespace();
                        const repository = options.repository;
                        const { wait = false, timeoutMs = 5 * 60 * 1000, pollIntervalMs = 15000 } = options;

                        if (this.verbose) {
                            console.log(`[Hub] Deleting repository ${namespace}/${repository}`);
                        }

                        await this.apiCall({
                            method: 'DELETE',
                            path: `/v2/repositories/${namespace}/${repository}/`,
                        });

                        if (wait) {
                            const startTime = Date.now();
                            while (Date.now() - startTime < timeoutMs) {
                                try {
                                    await this.getStats({ repository, namespace });
                                    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
                                } catch (error: any) {
                                    if (error?.message?.includes('404') || error?.message?.includes('not found')) {
                                        if (this.verbose) {
                                            console.log(`[Hub] Repository deletion confirmed`);
                                        }
                                        return;
                                    }
                                    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
                                }
                            }
                            throw new Error(`Timeout waiting for repository deletion after ${timeoutMs}ms`);
                        }
                    }
                },

                /**
                 * Login to Docker Hub registry via CLI
                 */
                loginCli: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options?: { cli?: any }): Promise<string> {
                        const cli = options?.cli;
                        if (!cli) {
                            throw new Error('cli capsule must be provided to loginCli');
                        }

                        const username = await this.$ConnectionConfig.getConfigValue('username');
                        const password = await this.$ConnectionConfig.getConfigValue('password');

                        if (this.verbose) {
                            console.log(`[Hub] Logging in to Docker Hub as ${username}`);
                        }

                        const result = await cli.exec([
                            'login',
                            '-u', username,
                            '--password-stdin',
                            'registry.hub.docker.com'
                        ]);

                        return result;
                    }
                },

            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44-docker.com/caps/Hub',
    })
}
