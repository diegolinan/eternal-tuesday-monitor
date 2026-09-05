import { fact } from './common.mjs';
export function parseListing(body, source) {
  const parsed = JSON.parse(body);
  const items = ['google-api', 'xai-api'].includes(source.adapter)
    ? parsed.models
    : parsed.data;
  if (!Array.isArray(items) || !items.length)
    throw new Error('MODEL_LIST_MISSING_OR_EMPTY');
  const models = items
    .map((item) => {
      const id =
        source.adapter === 'google-api'
          ? item.name?.replace(/^models\//, '')
          : item.id;
      if (!id || !new RegExp(source.id_pattern).test(id)) return null;
      const capabilities = [];
      const endpoints = [];
      const supported_parameters = [];
      if (
        source.adapter === 'google-api' &&
        item.supportedGenerationMethods?.includes('generateContent')
      )
        endpoints.push('generateContent');
      if (source.adapter === 'anthropic-api') {
        endpoints.push('messages');
        for (const [capability, value] of Object.entries(
          item.capabilities ?? {},
        ))
          if (value?.supported === true) capabilities.push(capability);
        if (item.max_tokens > 0) supported_parameters.push('max_tokens');
        if (item.capabilities?.tool_use?.supported === true)
          capabilities.push('tools');
      }
      return fact(source, {
        display_name: item.display_name ?? item.displayName ?? id,
        api_model_id: id,
        identity_url: source.url,
        api_state: 'API_AVAILABLE',
        account_access: 'ACCESS_CONFIRMED',
        release_state: 'RELEASED',
        version: item.version ?? null,
        released_on:
          source.adapter === 'anthropic-api' &&
          typeof item.created_at === 'string' &&
          /^20\d\d-\d\d-\d\dT/.test(item.created_at)
            ? item.created_at.slice(0, 10)
            : null,
        aliases:
          source.adapter === 'xai-api' && Array.isArray(item.aliases)
            ? item.aliases.filter(
                (alias) =>
                  typeof alias === 'string' &&
                  new RegExp(source.id_pattern).test(alias),
              )
            : [],
        supported_parameters,
        endpoints,
        capabilities,
      });
    })
    .filter(Boolean);
  let next = null;
  if (parsed.nextPageToken) {
    const url = new URL(source.url);
    url.searchParams.set('pageToken', parsed.nextPageToken);
    next = url.href;
  }
  if (parsed.has_more === true) {
    if (!parsed.last_id) throw new Error('PAGINATION_CURSOR_MISSING');
    const url = new URL(source.url);
    url.searchParams.set('after_id', parsed.last_id);
    next = url.href;
  }
  return { models, next };
}
