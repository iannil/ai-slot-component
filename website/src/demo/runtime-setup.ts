import { configureAiSlot, registerRenderer } from '@ai-slot/runtime'
import { createDomRenderer, type DomComponentDef } from '@ai-slot/adapter-dom'
import { defineRegistry } from '@ai-slot/registry'

/** 演示注册表：与 examples/plain-html 保持一致。 */
export const demoRegistry = defineRegistry({
  components: {
    'hero-banner': {
      description: '页面顶部主视觉区',
      props: {
        title: { type: 'string', maxLength: 60 },
        subtitle: { type: 'string', maxLength: 120 },
      },
      required: ['title'],
    },
    'markdown-block': {
      description: '纯内容组件',
      props: { content: 'string' },
      required: ['content'],
    },
  },
})

/** AI 组件树 → 真实 DOM；文本一律走 textContent。 */
const demoComponents: Record<string, DomComponentDef> = {
  'hero-banner': {
    tag: 'section',
    class: 'hero',
    applyProps: (el, props) => {
      const h1 = document.createElement('h1')
      h1.className = 'hero-title'
      h1.textContent = String(props.title ?? '')
      const p = document.createElement('p')
      p.className = 'hero-subtitle'
      p.textContent = String(props.subtitle ?? '')
      el.append(h1, p)
    },
  },
  'markdown-block': {
    tag: 'div',
    class: 'markdown',
    applyProps: (el, props) => {
      el.textContent = String(props.content ?? '')
    },
  },
}

let rendererReady = false

/** 幂等：首次注册渲染器并配置注册表。 */
export function ensureDemoRuntime(): void {
  if (!rendererReady) {
    registerRenderer('dom', createDomRenderer(demoComponents))
    rendererReady = true
  }
  configureAiSlot({ registry: demoRegistry })
}
