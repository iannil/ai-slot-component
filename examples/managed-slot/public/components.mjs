import { createDomRenderer } from '@ai-slot/adapter-dom';
import { allowedOrigins, registry } from './registry.mjs';

function safeLink(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || !allowedOrigins.includes(url.origin)) {
    throw new Error('url_denied');
  }
  return url.href;
}

// 注册表之外的组件不能降级成空白节点；新增组件须同时审查服务端契约和此映射。
export const components = {
  card: {
    tag: 'article',
    applyProps(element, props) {
      const title = document.createElement('h2');
      title.textContent = props.title;
      const price = document.createElement('p');
      price.textContent = props.price;
      const link = document.createElement('a');
      link.href = safeLink(props.link);
      link.textContent = '查看商品';
      element.append(title, price, link);
    },
  },
};
for (const name of Object.keys(registry.components)) {
  if (!Object.hasOwn(components, name)) throw new Error(`unsupported_component:${name}`);
}

export function createStrictRenderer() {
  const renderer = createDomRenderer(components);
  return (node, context) => {
    if (!Object.hasOwn(components, node.component)) throw new Error(`unsupported_component:${node.component}`);
    return renderer(node, context);
  };
}
