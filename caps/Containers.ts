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

                list: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, options: {
                        all?: boolean; filter?: string; format?: string; json?: boolean;
                    } = {}): Promise<string | any[]> {
                        const { all = false, filter, format, json = false } = options;
                        const args = ['ps'];
                        if (all) args.push('-a');
                        if (filter) args.push('--filter', filter);
                        if (json && !format) { args.push('--format', 'json'); }
                        else if (format) { args.push('--format', format); }
                        const result = await this.cli.exec(args);
                        if (json && !format) {
                            const lines = result.split('\n').filter((line: string) => line.trim());
                            if (lines.length === 0) return [];
                            return lines.map((line: string) => JSON.parse(line));
                        }
                        return result;
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/t44-docker.com/caps/Containers',
    })
}
