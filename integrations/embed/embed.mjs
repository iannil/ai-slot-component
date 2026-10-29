// ai-slot 通用嵌入包：为任意建站平台提供开箱即用的起步组件集。
// 安全纪律：
// - AI 文本一律以 textContent 写入，绝不使用 innerHTML；
// - 链接仅允许 http/https，其余协议丢弃；
// - 控制台诊断使用固定文案，不回显端点 URL、响应内容或注册表内容。
import { defineRegistry } from '@ai-slot/registry';
import { configureAiSlot, registerRenderer } from '@ai-slot/runtime';
import { createDomRenderer } from '@ai-slot/adapter-dom';

/** 起步注册表：与下方 starterComponents 一一对应。 */
export const starterRegistry = defineRegistry({
  components: {
    'hero-banner': {
      description: '首屏大标题区',
      props: {
        title: { type: 'string', maxLength: 120 },
        subtitle: { type: 'string', maxLength: 300 },
      },
      required: ['title'],
    },
    'markdown-block': {
      description: '纯文本内容块（不解析 HTML）',
      props: { content: { type: 'string', maxLength: 5000 } },
      required: ['content'],
    },
    'info-card': {
      description: '标题+正文的信息卡片',
      props: {
        title: { type: 'string', maxLength: 120 },
        body: { type: 'string', maxLength: 1000 },
      },
      required: ['title', 'body'],
    },
    'cta-banner': {
      description: '行动号召横幅，含一个跳转按钮',
      props: {
        title: { type: 'string', maxLength: 120 },
        buttonText: { type: 'string', maxLength: 40 },
        link: { type: 'string', maxLength: 500 },
      },
      required: ['title', 'buttonText', 'link'],
    },
    'feature-list': {
      description: '要点列表',
      props: {
        title: { type: 'string', maxLength: 120 },
        items: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 200 } },
      },
      required: ['title', 'items'],
    },
  },
});

/** 链接只放行 http/https；其余协议返回 null 由调用方丢弃。 */
function safeHttpUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch { /* 非法 URL 一律拒绝 */ }
  return null;
}

function appendText(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = String(text ?? '');
  return el;
}

/** 起步组件集：与 starterRegistry 对应，全部 textContent 写入。 */
export const starterComponents = {
  'hero-banner': {
    tag: 'section',
    class: 'ai-slot-hero',
    applyProps(el, props) {
      el.append(
        appendText('h2', 'ai-slot-hero-title', props.title),
        appendText('p', 'ai-slot-hero-subtitle', props.subtitle),
      );
    },
  },
  'markdown-block': {
    tag: 'div',
    class: 'ai-slot-markdown',
    applyProps(el, props) {
      el.textContent = String(props.content ?? '');
    },
  },
  'info-card': {
    tag: 'article',
    class: 'ai-slot-info-card',
    applyProps(el, props) {
      el.append(
        appendText('h3', 'ai-slot-info-card-title', props.title),
        appendText('p', 'ai-slot-info-card-body', props.body),
      );
    },
  },
  'cta-banner': {
    tag: 'div',
    class: 'ai-slot-cta',
    applyProps(el, props) {
      el.append(appendText('p', 'ai-slot-cta-title', props.title));
      const href = safeHttpUrl(props.link);
      if (!href) throw new Error('link_denied');
      const a = document.createElement('a');
      a.className = 'ai-slot-cta-button';
      a.href = href;
      a.rel = 'noopener noreferrer';
      a.textContent = String(props.buttonText ?? '');
      el.append(a);
    },
  },
  'feature-list': {
    tag: 'div',
    class: 'ai-slot-feature-list',
    applyProps(el, props) {
      el.append(appendText('h3', 'ai-slot-feature-list-title', props.title));
      const ul = document.createElement('ul');
      for (const item of Array.isArray(props.items) ? props.items : []) {
        ul.append(appendText('li', '', item));
      }
      el.append(ul);
    },
  },
};

/**
 * 幂等引导：注册 dom 渲染器与起步注册表。
 * 在浏览器环境随模块加载自动执行；重复执行不会重复注册。
 */
let bootstrapped = false;
export function bootstrapAiSlotEmbed() {
  if (bootstrapped) return;
  bootstrapped = true;
  registerRenderer('dom', createDomRenderer(starterComponents));
  configureAiSlot({
    registry: starterRegistry,
    onFailure: () => {
      // 固定诊断文案：不回显 URL、响应内容或注册表内容
      console.warn('[ai-slot] 槽位内容暂不可用，已保留原始内容');
    },
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  bootstrapAiSlotEmbed();
}
