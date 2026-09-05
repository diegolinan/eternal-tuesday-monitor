import { document, main, tags, cells, text } from '../html.mjs';
import { fact } from './common.mjs';
export function index(body, source) {
  const tables = tags(main(document(body)), 'table');
  const result = [];
  for (const table of tables) {
    const rows = tags(table, 'tr');
    const identity = rows.find((row) =>
      text(cells(row)[0]).startsWith('Claude API ID'),
    );
    if (!identity) continue;
    const headings = cells(rows[0]).slice(1);
    cells(identity)
      .slice(1)
      .forEach((cell, i) => {
        const id = text(cell).trim();
        if (!new RegExp(source.id_pattern).test(id)) return;
        const heading = headings[i];
        const name = text(tags(heading, 'a')[0]) || id;
        result.push(
          fact(source, {
            display_name: name,
            api_model_id: id,
            identity_url: source.url,
            endpoints: ['messages'],
          }),
        );
      });
  }
  if (!result.length) throw new Error('CLAUDE_API_ID_TABLE_MISSING');
  return result;
}
