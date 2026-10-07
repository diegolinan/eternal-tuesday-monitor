export function readChangeType(search, types) {
  const type = new URLSearchParams(search).get('type');
  return type && types.includes(type) ? type : 'ALL';
}

export function readModelView(search, models) {
  const params = new URLSearchParams(search);
  const requestedModel = params.get('model');
  const knownModel = models.some((model) => model.id === requestedModel);
  return {
    scope: params.get('scope') === 'all' ? 'all' : 'focus',
    query: params.get('q') ?? '',
    modelId: knownModel ? requestedModel : null,
    missingModel: requestedModel && !knownModel ? requestedModel : null,
  };
}

/** Encode query values and fragments independently, preserving the local base path. */
export function viewHref(path, values = {}, fragment = '') {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== '')
      params.set(key, String(value));
  }
  const query = params.toString();
  return `${path}${query ? `?${query}` : ''}${fragment ? `#${encodeURIComponent(fragment)}` : ''}`;
}
