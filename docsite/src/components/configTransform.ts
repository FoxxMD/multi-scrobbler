import json5 from 'json5';

/** Filter an example config array to one configureAs type and optionally wrap it as an AIO config */
export function transformConfig(data: string | object, configureAs: 'client' | 'source' | undefined, aio: boolean, name: string): object {
	let content: any = typeof data === 'string' ? json5.parse(data) : data;
	if (configureAs !== undefined && Array.isArray(content)) {
		const filtered = content.filter((x) => x.configureAs === undefined || x.configureAs === configureAs);
		content = aio ? { [configureAs === 'client' ? 'clients' : 'sources']: filtered.map((x) => ({ ...x, type: name })) } : filtered;
	}
	return content;
}

export const toJson = (o: unknown) => JSON.stringify(o, null, 2);
