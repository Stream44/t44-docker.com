import { $ } from 'bun'
import { access, mkdir, cp, rm, readdir, stat, readFile, writeFile } from 'fs/promises'
import { constants } from 'fs'
import { join, isAbsolute } from 'path'
import { Glob } from 'bun'

/**
 * Dockerfile variants to build
 */
const DOCKERFILE_VARIANTS = {
    alpine: { dockerfile: 'Dockerfile.alpine', tagSuffix: 'alpine', variantDir: 'alpine', variant: 'alpine' },
    distroless: { dockerfile: 'Dockerfile.distroless', tagSuffix: 'distroless', variantDir: 'distroless', variant: 'distroless' },
} as const;

// TODO: Use "importer" bridge file that gets inlined when building.
const DEFAULT_TEMPLATE_DIR = join(__dirname, 'Image', 'tpl');

type FileSpecCallback = (context: { appBaseDir: string; archDir: string; buildContextDir: string }) => string | object | [string, string] | Promise<string | object | [string, string]>;
type FileSpec = string | object | [string, string] | FileSpecCallback;
type FilesSpec = Record<string, FileSpec>;

/**
 * Trim common leading whitespace from all lines in a string.
 */
function trimIndentation(str: string): string {
    const lines = str.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    if (nonEmptyLines.length === 0) {
        return str;
    }
    const minIndent = Math.min(
        ...nonEmptyLines.map(line => {
            const match = line.match(/^[ \t]*/);
            return match ? match[0].length : 0;
        })
    );
    return lines.map(line => {
        if (line.trim().length === 0) {
            return '';
        }
        return line.slice(minIndent);
    }).join('\n');
}

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
                    value: './ImageContext',
                    options: { /* requires new instance */ },
                },

                DOCKERFILE_VARIANTS: {
                    type: CapsulePropertyTypes.Constant,
                    value: DOCKERFILE_VARIANTS,
                },

                trimIndentation: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, str: string): string {
                        return trimIndentation(str);
                    }
                },

                /**
                 * Copy files based on custom file specification
                 */
                copySpecifiedFiles: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, {
                        filesSpec,
                        appBaseDir,
                        buildContextDir,
                        archDir,
                    }: {
                        filesSpec: FilesSpec;
                        appBaseDir: string;
                        buildContextDir: string;
                        archDir: string;
                    }): Promise<void> {
                        const context = { appBaseDir, archDir, buildContextDir };

                        for (const [destRelPath, spec] of Object.entries(filesSpec)) {
                            const destPath = join(buildContextDir, destRelPath);
                            await mkdir(join(destPath, '..'), { recursive: true });

                            let resolvedSpec: string | object | [string, string];
                            if (typeof spec === 'function') {
                                resolvedSpec = await spec(context);
                            } else {
                                resolvedSpec = spec;
                            }

                            if (typeof resolvedSpec === 'object' && !Array.isArray(resolvedSpec)) {
                                if (this.verbose) console.log(`  Writing JSON file: ${destRelPath}`);
                                await writeFile(destPath, JSON.stringify(resolvedSpec, null, 2));
                            } else if (typeof resolvedSpec === 'string') {
                                const isContent = resolvedSpec.includes('\n') ||
                                    resolvedSpec.includes('\r') ||
                                    (resolvedSpec.includes(' ') && !isAbsolute(resolvedSpec) && !resolvedSpec.startsWith('.'));

                                if (isContent) {
                                    if (this.verbose) console.log(`  Writing content to file: ${destRelPath}`);
                                    const trimmedContent = trimIndentation(resolvedSpec);
                                    await writeFile(destPath, trimmedContent);
                                } else {
                                    const srcPath = isAbsolute(resolvedSpec) ? resolvedSpec : join(appBaseDir, resolvedSpec);
                                    if (this.verbose) console.log(`  Copying file: ${srcPath} -> ${destRelPath}`);
                                    try {
                                        await access(srcPath, constants.F_OK);
                                        const stats = await stat(srcPath);
                                        if (stats.isDirectory()) {
                                            await cp(srcPath, destPath, { recursive: true, force: true });
                                        } else {
                                            await cp(srcPath, destPath, { force: true });
                                        }
                                    } catch (error) {
                                        throw new Error(`Failed to copy ${srcPath} to ${destPath}: ${error}`);
                                    }
                                }
                            } else if (Array.isArray(resolvedSpec) && resolvedSpec.length === 2) {
                                const [baseDir, globPattern] = resolvedSpec;
                                const resolvedBaseDir = isAbsolute(baseDir) ? baseDir : join(appBaseDir, baseDir);
                                if (this.verbose) console.log(`  Copying glob: ${globPattern} from ${resolvedBaseDir} -> ${destRelPath}`);

                                const glob = new Glob(globPattern);
                                const matches = Array.from(glob.scanSync({ cwd: resolvedBaseDir, absolute: false }));

                                if (matches.length === 0) {
                                    if (this.verbose) console.log(`  ⚠️  No files matched glob pattern: ${globPattern}`);
                                }

                                for (const match of matches) {
                                    const srcPath = join(resolvedBaseDir, match);
                                    const destFilePath = join(destPath, match);
                                    await mkdir(join(destFilePath, '..'), { recursive: true });
                                    const stats = await stat(srcPath);
                                    if (stats.isDirectory()) {
                                        await cp(srcPath, destFilePath, { recursive: true, force: true });
                                    } else {
                                        await cp(srcPath, destFilePath, { force: true });
                                    }
                                }
                            } else {
                                throw new Error(`Invalid file spec for ${destRelPath}: ${JSON.stringify(resolvedSpec)}`);
                            }
                        }
                    }
                },

                /**
                 * Prepare build context by copying app files and Dockerfile template
                 */
                prepareBuildContext: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, {
                        appBaseDir,
                        buildContextDir,
                        templateDir,
                        variant,
                        arch,
                        files,
                        buildScriptName,
                    }: {
                        appBaseDir: string;
                        buildContextDir: string;
                        templateDir: string;
                        variant: typeof DOCKERFILE_VARIANTS[keyof typeof DOCKERFILE_VARIANTS];
                        arch: { archDir: string; arch: string; os: string };
                        files?: FilesSpec;
                        buildScriptName?: string;
                    }): Promise<void> {
                        // Create build context directory
                        try {
                            await access(buildContextDir, constants.F_OK);
                            await rm(buildContextDir, { recursive: true, force: true });
                        } catch {
                            // Directory doesn't exist
                        }
                        await mkdir(buildContextDir, { recursive: true });

                        // Copy template package.json first (as default)
                        const templatePackageJson = join(templateDir, 'package.json');
                        try {
                            await access(templatePackageJson, constants.F_OK);
                            if (this.verbose) console.log(`  Copying template package.json...`);
                            await cp(templatePackageJson, join(buildContextDir, 'package.json'));
                        } catch {
                            // Template package.json doesn't exist, skip
                        }

                        // Check if package.json has a build script and run it
                        const appPackageJsonPath = join(appBaseDir, 'package.json');
                        try {
                            await access(appPackageJsonPath, constants.F_OK);
                            const packageJsonContent = await Bun.file(appPackageJsonPath).text();
                            const packageJson = JSON.parse(packageJsonContent);

                            const scriptName = buildScriptName || 'build';

                            if (this.verbose) {
                                console.log(`  Checking for build script '${scriptName}' in ${appPackageJsonPath}...`);
                                console.log(`  Available scripts: ${Object.keys(packageJson.scripts || {}).join(', ')}`);
                            }

                            if (packageJson.scripts?.[scriptName]) {
                                if (this.verbose) {
                                    console.log(`  Running ${scriptName} script...`);
                                    console.log(`  Working directory: ${appBaseDir}`);
                                }

                                const args: string[] = [];
                                args.push('--arch', arch.arch);
                                args.push('--os', arch.os);
                                args.push('--archDir', arch.archDir);
                                args.push('--variant', variant.variant);
                                args.push('--variantDir', variant.variantDir);

                                try {
                                    if (this.verbose) {
                                        await $`bun run ${scriptName} ${args}`.cwd(appBaseDir);
                                    } else {
                                        await $`bun run ${scriptName} ${args}`.cwd(appBaseDir).quiet();
                                    }
                                    if (this.verbose) console.log(`  ✓ Build completed`);
                                } catch (buildError) {
                                    if (this.verbose) console.log(`  ❌ Build script failed: ${buildError}`);
                                    throw buildError;
                                }
                            } else {
                                if (this.verbose) console.log(`  ⚠️  Build script '${scriptName}' not found, skipping build step`);
                            }
                        } catch (error: any) {
                            if (error?.code === 'ENOENT' || error?.message?.includes('ENOENT')) {
                                if (this.verbose) console.log(`  ℹ️  No package.json found, skipping build script`);
                            } else {
                                if (this.verbose) console.log(`  ⚠️  Error checking/running build script: ${error}`);
                            }
                        }

                        // Copy Dockerfile template to build context
                        const dockerfileSrc = join(templateDir, variant.dockerfile);
                        const dockerfileDest = join(buildContextDir, 'Dockerfile');
                        if (this.verbose) console.log(`  Copying Dockerfile template: ${variant.dockerfile}`);
                        await cp(dockerfileSrc, dockerfileDest);

                        // Handle file copying
                        if (files) {
                            if (this.verbose) console.log(`  Copying specified files...`);
                            await this.copySpecifiedFiles({
                                filesSpec: files,
                                appBaseDir,
                                buildContextDir,
                                archDir: arch.archDir,
                            });
                        } else {
                            if (this.verbose) console.log(`  Copying app files from ${appBaseDir}...`);

                            const dockerignorePath = join(appBaseDir, '.dockerignore');
                            let ignorePatterns: string[] = ['node_modules', '.git', '.DS_Store', '.~o'];
                            try {
                                const dockerignoreContent = await readFile(dockerignorePath, 'utf-8');
                                const customPatterns = dockerignoreContent
                                    .split('\n')
                                    .map(line => line.trim())
                                    .filter(line => line && !line.startsWith('#'));
                                ignorePatterns = [...ignorePatterns, ...customPatterns];
                                if (this.verbose) console.log(`  Loaded .dockerignore with ${customPatterns.length} patterns`);
                            } catch {
                                // .dockerignore doesn't exist
                            }

                            const entries = await readdir(appBaseDir);

                            for (const entry of entries) {
                                const srcPath = join(appBaseDir, entry);
                                const destPath = join(buildContextDir, entry);

                                if (srcPath === buildContextDir || srcPath.startsWith(buildContextDir + '/') || srcPath.startsWith(buildContextDir + '\\')) {
                                    continue;
                                }

                                let shouldIgnore = false;
                                for (const pattern of ignorePatterns) {
                                    const glob = new Glob(pattern);
                                    if (glob.match(entry)) {
                                        shouldIgnore = true;
                                        break;
                                    }
                                }

                                if (shouldIgnore) {
                                    if (this.verbose) console.log(`  Ignoring: ${entry}`);
                                    continue;
                                }

                                const stats = await stat(srcPath);
                                if (stats.isDirectory()) {
                                    await cp(srcPath, destPath, { recursive: true, force: true });
                                } else {
                                    await cp(srcPath, destPath, { force: true });
                                }
                            }
                        }
                    }
                },

                /**
                 * Build a single Docker image variant for a specific architecture
                 */
                buildVariant: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, opts?: {
                        variant?: string;
                        arch?: string;
                        files?: FilesSpec;
                        tagLatest?: boolean;
                        attestations?: { sbom?: boolean; provenance?: boolean };
                    }): Promise<{ imageTag: string }> {
                        const variant = opts?.variant ?? this.context.variant;
                        const arch = opts?.arch ?? this.context.arch;
                        const files = opts?.files ?? this.context.files;
                        const shouldTagLatest = opts?.tagLatest ?? this.context.tagLatest;
                        const attestations = opts?.attestations ?? this.context.attestations;

                        if (!variant || !arch) {
                            throw new Error('variant and arch must be set');
                        }

                        if (this.context.verbose) {
                            console.log(`\nBuilding ${variant} for ${arch}...`);
                        }

                        const variantInfo = DOCKERFILE_VARIANTS[variant as keyof typeof DOCKERFILE_VARIANTS];
                        const archInfo = this.cli.DOCKER_ARCHS[arch as keyof typeof this.cli.DOCKER_ARCHS];
                        const buildContextDir = this.context.getBuildContextDir({ variant });

                        await this.prepareBuildContext({
                            appBaseDir: this.context.appBaseDir,
                            buildContextDir,
                            templateDir: this.context.templateDir,
                            variant: variantInfo,
                            arch: archInfo,
                            files,
                            buildScriptName: this.context.buildScriptName,
                        });

                        const imageTag = this.context.getImageTag({ variant, arch });

                        // Build Docker image
                        await this.buildImage({
                            context: buildContextDir,
                            dockerfile: join(buildContextDir, 'Dockerfile'),
                            tag: imageTag,
                            attestations,
                        });

                        if (this.context.verbose) {
                            console.log(`✅ Built ${imageTag}`);
                            console.log(`   Build context preserved at: ${buildContextDir}`);
                        }

                        if (shouldTagLatest) {
                            const latestTag = this.context.getLatestImageTag({ variant, arch });
                            await this.cli.tagImage({ sourceImage: imageTag, targetImage: latestTag });
                        }

                        return { imageTag };
                    }
                },

                /**
                 * Build all Docker image variants for all architectures
                 */
                buildAll: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<{ imageTag: string }[]> {
                        const results: { imageTag: string }[] = [];

                        for (const variantKey of Object.keys(this.context.DOCKERFILE_VARIANTS)) {
                            for (const archKey of Object.keys(this.cli.DOCKER_ARCHS)) {
                                const result = await this.buildVariant({
                                    variant: variantKey,
                                    arch: archKey,
                                });
                                results.push(result);
                            }
                        }

                        return results;
                    }
                },

                /**
                 * Build for current platform only (convenience)
                 */
                build: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<{ imageTag: string }> {
                        const currentArch = this.cli.getCurrentPlatformArch();
                        const variant = this.context.variant || 'alpine';
                        return this.buildVariant({ variant, arch: currentArch });
                    }
                },

                /**
                 * Get all tags for the provided namespace with metadata
                 */
                getTags: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, opts?: { organization?: string; repository?: string }): Promise<any[]> {
                        const org = opts?.organization ?? this.context.organization;
                        const repo = opts?.repository ?? this.context.repository;
                        const imageNamespace = `${org}/${repo}`;

                        const imagesOutput = await this.listImages({
                            filter: `reference=${imageNamespace}`,
                            format: '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedAt}}',
                        });

                        const tags: any[] = [];

                        for (const line of (imagesOutput as string).split('\n')) {
                            const trimmed = line.trim();
                            if (!trimmed) continue;

                            const [tag, imageId, size, created] = trimmed.split('\t');
                            if (!tag || !imageId) continue;

                            let variant: string | undefined;
                            let arch: string | undefined;

                            const tagSuffix = tag.split(':')[1];
                            if (tagSuffix) {
                                for (const [variantKey, variantInfo] of Object.entries(DOCKERFILE_VARIANTS)) {
                                    if (tagSuffix.startsWith(variantInfo.tagSuffix)) {
                                        variant = variantKey;
                                        for (const [archKey, archInfo] of Object.entries(this.cli.DOCKER_ARCHS) as Array<[string, any]>) {
                                            if (tagSuffix.includes(archInfo.arch)) {
                                                arch = archKey;
                                                break;
                                            }
                                        }
                                        break;
                                    }
                                }
                            }

                            tags.push({ tag, imageId, size: size || '', created: created || '', variant, arch });
                        }

                        return tags;
                    }
                },

                /**
                 * Inspect the image
                 */
                inspect: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, opts?: { variant?: string; arch?: string }): Promise<string> {
                        const imageTag = this.context.getImageTag(opts);
                        return await this.inspectImage({ image: imageTag });
                    }
                },

                // --- Image-specific CLI methods (not shared) ---

                /**
                 * Build a Docker image from a Dockerfile
                 */
                buildImage: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        dockerfile?: string;
                        context: string;
                        tag: string;
                        buildArgs?: Record<string, string>;
                        noCache?: boolean;
                        attestations?: { sbom?: boolean; provenance?: boolean };
                    }): Promise<string> {
                        const { dockerfile = 'Dockerfile', context, tag, buildArgs, noCache, attestations } = options;

                        const args = ['build'];

                        if (dockerfile) {
                            const dockerfilePath = isAbsolute(dockerfile) ? dockerfile : join(context, dockerfile);
                            args.push('-f', dockerfilePath);
                        }

                        args.push('-t', tag);

                        if (noCache) {
                            args.push('--no-cache');
                        }

                        if (buildArgs) {
                            for (const [key, value] of Object.entries(buildArgs)) {
                                args.push('--build-arg', `${key}=${value}`);
                            }
                        }

                        if (attestations?.sbom) {
                            args.push('--attest', 'type=sbom');
                        }
                        if (attestations?.provenance) {
                            args.push('--attest', 'type=provenance,mode=max');
                        }

                        args.push(context);

                        return await this.cli.exec(args);
                    }
                },

                /**
                 * Inspect a Docker image
                 */
                inspectImage: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: { image: string }): Promise<string> {
                        return await this.cli.exec(['image', 'inspect', options.image]);
                    }
                },

                /**
                 * List Docker images
                 */
                listImages: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        all?: boolean;
                        filter?: string;
                        format?: string;
                        json?: boolean;
                    } = {}): Promise<string | any[]> {
                        const { all = false, filter, format, json = false } = options;
                        const args = ['images'];

                        if (all) args.push('-a');
                        if (filter) args.push('--filter', filter);

                        if (json && !format) {
                            args.push('--format', 'json');
                        } else if (format) {
                            args.push('--format', format);
                        }

                        const result = await this.cli.exec(args);

                        if (json && !format) {
                            const lines = result.split('\n').filter((line: string) => line.trim());
                            if (lines.length === 0) return [];
                            return lines.map((line: string) => JSON.parse(line));
                        }

                        return result;
                    }
                },

                /**
                 * Check if a Docker image tag exists
                 */
                doesImageTagExist: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, imageTag: string): Promise<boolean> {
                        const normalizedTag = imageTag.includes(':') ? imageTag : `${imageTag}:latest`;
                        const images = await this.listImages({
                            filter: `reference=${normalizedTag}`,
                            json: true,
                        });
                        return Array.isArray(images) && images.length > 0;
                    }
                },

                /**
                 * Get the size of a Docker image
                 */
                getImageSize: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: { image: string }): Promise<string> {
                        return await this.cli.exec(['images', options.image, '--format', '{{.Size}}']);
                    }
                },

                /**
                 * Remove a Docker image
                 */
                removeImage: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: { image: string; force?: boolean }): Promise<string> {
                        const args = ['rmi'];
                        if (options.force) args.push('-f');
                        args.push(options.image);
                        return await this.cli.exec(args);
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44-docker.com/caps/Image',

    })
}
