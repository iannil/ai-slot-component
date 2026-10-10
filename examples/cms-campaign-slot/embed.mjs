import { configureAiSlot, registerRenderer } from '@ai-slot/runtime';
import { createDomRenderer } from '@ai-slot/adapter-dom';

const hosts = [...document.querySelectorAll('[data-ai-slot-endpoint][data-ai-slot-registry]')];
const registries = new Map();
let accepted = null;
let configured = false;

function publicUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('invalid_url');
  return url;
}
function safeLink(value, allowedOrigins) {
  const url = publicUrl(value);
  if (!allowedOrigins.includes(url.origin)) throw new Error('url_denied');
  return url.href;
}
function strictRenderer(allowedOrigins) {
  const components = {
    card: {
      tag: 'article',
      applyProps(element, props) {
        const title = document.createElement('h2');
        title.textContent = props.title;
        const price = document.createElement('p');
        price.textContent = props.price;
        const link = document.createElement('a');
        link.href = safeLink(props.link, allowedOrigins);
        link.textContent = '查看商品';
        element.append(title, price, link);
      },
    },
  };
  const render = createDomRenderer(components);
  return (node, context) => {
    if (!Object.hasOwn(components, node.component)) throw new Error('unsupported_component');
    return render(node, context);
  };
}
async function getRegistry(url) {
  if (!registries.has(url.href)) {
    registries.set(url.href, (async () => {
      const response = await fetch(url.href, { credentials: 'omit', cache: 'no-store' });
      if (!response.ok) throw new Error('registry_unavailable');
      const data = await response.json();
      if (!data || typeof data !== 'object' || !data.registry?.components ||
        typeof data.registryVersion !== 'string' || !data.registryVersion ||
        data.rendererVersion !== 'v1' || !Array.isArray(data.allowedOrigins) ||
        !data.allowedOrigins.every(origin => typeof origin === 'string' && publicUrl(origin).origin === origin)) {
        throw new Error('registry_invalid');
      }
      const components = data.registry.components;
      if (!components || typeof components !== 'object' || Array.isArray(components) ||
        Object.keys(components).length !== 1 || !Object.hasOwn(components, 'card')) throw new Error('unsupported_component');
      const card = components.card;
      if (!card || typeof card !== 'object' || !card.props ||
        !['title', 'price', 'link'].every(key => card.props[key]?.type === 'string' && card.required?.includes(key))) {
        throw new Error('registry_invalid');
      }
      return data;
    })());
  }
  return registries.get(url.href);
}

for (const host of hosts) {
  try {
    const endpoint = publicUrl(host.dataset.aiSlotEndpoint);
    const registryUrl = publicUrl(host.dataset.aiSlotRegistry);
    if (endpoint.origin !== registryUrl.origin) throw new Error('registry_origin_mismatch');
    const data = await getRegistry(registryUrl);
    const signature = JSON.stringify([data.registryVersion, data.rendererVersion, data.registry, data.allowedOrigins]);
    if (accepted && accepted !== signature) throw new Error('registry_conflict');
    if (!configured) {
      configureAiSlot({ registry: data.registry });
      registerRenderer('dom', strictRenderer(data.allowedOrigins));
      accepted = signature;
      configured = true;
    }
    const slot = document.createElement('ai-slot');
    slot.setAttribute('name', 'hero');
    slot.setAttribute('src', endpoint.href);
    slot.setAttribute('fresh-only', '');
    slot.setAttribute('refresh-interval', '60');
    while (host.firstChild) slot.append(host.firstChild);
    host.replaceWith(slot);
  } catch (error) {
    // 固定诊断避免把来源内容或 URL 写进控制台。原始 WordPress 壳继续显示。
    console.warn(`[ai-slot] 槽位未启用：${error instanceof Error ? error.message : 'unknown_error'}`);
  }
}
