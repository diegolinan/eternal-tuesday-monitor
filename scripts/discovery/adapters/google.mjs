import { document, main, tags, cells, text } from '../html.mjs';
import { fact } from './common.mjs';
export function index(body, source) {
  const result = [];
  for (const row of tags(main(document(body)), 'tr')) {
    const columns = cells(row);
    if (columns.length < 2) continue;
    const ids = [
      ...new Set([
        ...tags(columns.at(-1), 'code').map(text),
        text(columns.at(-1)),
      ]),
    ].filter((id) => new RegExp(source.id_pattern).test(id));
    for (const id of ids)
      result.push(
        fact(source, {
          display_name: text(columns[0]).replace(/\s*\(Shut down\)/i, ''),
          api_model_id: id,
          identity_url: source.url,
          release_state: /Shut down/i.test(text(row))
            ? 'RETIRED'
            : 'DISCOVERED',
          channel: /preview/i.test(text(columns[0])) ? 'PREVIEW' : 'UNKNOWN',
        }),
      );
  }
  if (!result.length) throw new Error('GEMINI_ENDPOINT_TABLE_MISSING');
  return result;
}
