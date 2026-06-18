'use strict';

function deepMerge(base, override) {
  const result = Object.assign({}, base);
  for (const key of Object.keys(override)) {
    if (
      typeof override[key] === 'object' && override[key] !== null && !Array.isArray(override[key]) &&
      typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

function buildSettings(base, profile, priv) {
  const merged = deepMerge(base, profile);
  if (!merged.env) merged.env = {};
  merged.env.ANTHROPIC_AUTH_TOKEN = priv.ANTHROPIC_AUTH_TOKEN;
  merged.env.ANTHROPIC_BASE_URL = priv.ANTHROPIC_BASE_URL;
  return merged;
}

module.exports = { deepMerge, buildSettings };
