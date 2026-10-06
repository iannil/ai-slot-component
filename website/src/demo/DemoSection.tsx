import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, MousePointerClick, Play, RotateCcw, ShieldAlert, SlidersHorizontal, UploadCloud } from 'lucide-react'
import { ensureDemoRuntime } from './runtime-setup'
import { activateDemoBackend, applyDemoPrompt, publishDemoUpdate, type VirtualBackendConfig } from './virtual-backend'
import { INDUSTRIES, industryById, type DemoLang, type Industry, type IndustryId } from './industries'
import { renderPage } from './pages'
import './demo.css'

/** 演示区界面文案（行业内容文案在 industries.ts） */
const ui = {
  zh: {
    start: '开始操作 →',
    openBtn: '打开页面',
    steps: [
      { title: '打开页面：AI 增强上屏', hint: '静态内容先行渲染（SEO 与无障碍安全），AI 组件树就绪后流式替换该区域。' },
      { title: '运营改内容，原地生效', hint: '模拟数据源变更：发布 → 失效推送 → 页面原地更新，不改代码、免发版。' },
      { title: '运营改卖点方向，推送生效', hint: '在下方控制台修改提示词并发布——所有打开的页面原地更新。页面上没有输入框，访客只看到结果。' },
      { title: 'AI 挂了，页面不坏', hint: '推荐服务已置为故障。重新加载推荐区——内容纹丝不动，不白屏、不报错。' },
    ],
    opsTitle: '运营后台（模拟）',
    opsCurrent: '当前线上',
    opsNext: '待发布',
    publishBtn: '发布更新',
    opsPromptCurrent: '当前提示词',
    opsPromptPlaceholder: '输入新的卖点方向…',
    opsApply: '发布并推送',
    opsPreset: '预设方向',
    reloadRec: '重新加载推荐区',
    recDown: '推荐服务：故障中（模拟）',
    fallbackOk: '兜底生效：请求失败，推荐区保持静态内容。',
    doneTitle: '四种交付方式都跑完了',
    doneHint: '预生成（构建期烘焙，零运行时成本）在示例仓库里通过 node prewarm.mjs 体验。',
    restart: '重新演示',
    change: '换个行业',
  },
  en: {
    start: 'Try it →',
    openBtn: 'Open the page',
    steps: [
      { title: 'Open the page: AI content lands', hint: 'Static markup renders first (SEO & a11y safe); the validated component tree replaces it when ready.' },
      { title: 'Change content in ops, live in place', hint: 'Simulate a data-source change: publish → invalidation push → the slot updates in place. No redeploy.' },
      { title: 'Change the angle in ops, pushed live', hint: 'Edit the prompt in the console below and publish — every open page updates in place. There is no input box on the page; visitors only see the result.' },
      { title: 'AI down? The page holds', hint: 'The recommendation service is set to fail. Reload the section — the static content stays, no blank screen.' },
    ],
    opsTitle: 'Ops console (simulated)',
    opsCurrent: 'Live now',
    opsNext: 'Staged',
    publishBtn: 'Publish update',
    opsPromptCurrent: 'Current prompt',
    opsPromptPlaceholder: 'Type a new angle…',
    opsApply: 'Publish & push',
    opsPreset: 'Preset angle',
    reloadRec: 'Reload recommendation',
    recDown: 'Recommendation service: down (simulated)',
    fallbackOk: 'Fallback held: the request failed and the static content stayed.',
    doneTitle: 'All three delivery modes, done',
    doneHint: 'Pregeneration (baked at build time, zero runtime cost) lives in the example repo: node prewarm.mjs.',
    restart: 'Replay',
    change: 'Switch industry',
  },
} as const

/** 由行业数据装配虚拟后端：hero 槽位按版本轮换促销/导读、按运营提示词切换卖点方向，rec 槽位永远故障。 */
function backendFor(ind: Industry, lang: DemoLang): VirtualBackendConfig {
  const c = ind.copy[lang]
  const customNote = (prompt: string) =>
    lang === 'zh' ? `已按新方向调整：${prompt.slice(0, 40)}` : `Adjusted to: ${prompt.slice(0, 40)}`
  return {
    delayMs: 1100,
    slots: {
      [`${ind.id}-hero`]: {
        tree: (version, prompt) => {
          const isAlt = prompt === c.opPrompt
          const isCustom = Boolean(prompt) && !isAlt
          if (ind.heroComponent === 'markdown-block') {
            return {
              component: 'markdown-block',
              props: {
                content: isAlt
                  ? c.opSubtitle
                  : isCustom
                    ? customNote(prompt!)
                    : c.promos[version % c.promos.length],
              },
            }
          }
          return {
            component: 'hero-banner',
            props: isAlt
              ? { title: c.opTitle, subtitle: c.opSubtitle }
              : isCustom
                ? { title: c.heroTitle, subtitle: customNote(prompt!) }
                : { title: c.heroTitle, subtitle: c.promos[version % c.promos.length] },
          }
        },
      },
      [`${ind.id}-rec`]: { fail: true, tree: () => null },
    },
  }
}

/** 把占位 div 替换为真实 <ai-slot> 元素：此时元素 connect，首次加载才真正发起。 */
function mountSlots(stage: HTMLElement): void {
  for (const m of Array.from(stage.querySelectorAll<HTMLElement>('.slot-mount'))) {
    const slot = document.createElement('ai-slot')
    const name = m.dataset.name ?? ''
    slot.setAttribute('name', name)
    slot.setAttribute('src', `/ai-render/${name}`)
    if (m.hasAttribute('data-stream')) {
      slot.setAttribute('stream', '')
      slot.setAttribute('live', '')
    }
    if (m.classList.contains('rec')) slot.setAttribute('class', 'rec')
    slot.innerHTML = m.innerHTML
    m.replaceWith(slot)
  }
}

const stepIcons = [Play, UploadCloud, SlidersHorizontal, ShieldAlert]

export default function DemoSection({ lang }: { lang: DemoLang }) {
  const t = ui[lang]
  const [selected, setSelected] = useState<IndustryId | null>(null)
  const [nonce, setNonce] = useState(0)
  const [step, setStep] = useState(0)
  const [fallbackOk, setFallbackOk] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')
  const stageRef = useRef<HTMLDivElement>(null)
  const stepRef = useRef(step)
  useEffect(() => {
    stepRef.current = step
  }, [step])
  const obsRef = useRef<MutationObserver | null>(null)
  const checkRef = useRef<() => void>(() => {})

  const ind = selected ? industryById(selected) : null
  const c = ind ? ind.copy[lang] : null

  // 会话切换（选行业 / 切语言 / 重新演示）时在渲染期重置进度
  const sessionKey = selected ? `${selected}:${lang}:${nonce}` : null
  const [prevSession, setPrevSession] = useState<string | null>(sessionKey)
  if (prevSession !== sessionKey) {
    setPrevSession(sessionKey)
    setStep(0)
    setFallbackOk(false)
    setPromptDraft('')
  }

  // 会话装配：选行业 / 切语言 / 重新演示时，重建静态页与虚拟后端
  useEffect(() => {
    if (!selected || !stageRef.current) return
    const industry = industryById(selected)
    ensureDemoRuntime()
    activateDemoBackend(backendFor(industry, lang))
    stageRef.current.innerHTML = renderPage(selected, lang)
    // 步骤推进检测：watch hero 槽位文本变化
    const copy = industry.copy[lang]
    checkRef.current = () => {
      const hero = stageRef.current?.querySelector(`ai-slot[name="${industry.id}-hero"]`)
      const text = hero?.textContent ?? ''
      const s = stepRef.current
      if (s === 0 && text.includes(copy.promos[0])) setStep(1)
      else if (s === 1 && copy.promos[1] && text.includes(copy.promos[1])) setStep(2)
      else if (s === 2 && text.includes(copy.doneOp)) setStep(3)
    }
    return () => {
      obsRef.current?.disconnect()
      obsRef.current = null
      activateDemoBackend(null)
    }
  }, [selected, lang, nonce])

  const openPage = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    mountSlots(stage)
    obsRef.current?.disconnect()
    const obs = new MutationObserver(() => checkRef.current())
    obs.observe(stage, { subtree: true, childList: true, characterData: true })
    obsRef.current = obs
  }, [])

  const publish = useCallback(() => {
    if (selected) publishDemoUpdate(`${selected}-hero`)
  }, [selected])

  // 步骤 3：运营在控制台改卖点方向并推送——页面上没有输入框，访客只看到结果
  const applyOps = useCallback(() => {
    if (!selected || !c) return
    applyDemoPrompt(`${selected}-hero`, promptDraft.trim() || c.opPrompt)
  }, [selected, c, promptDraft])

  const reloadRec = useCallback(async () => {
    const stage = stageRef.current
    if (!stage || !ind || !c) return
    const rec = stage.querySelector(`ai-slot[name="${ind.id}-rec"]`) as (HTMLElement & { load?: () => Promise<void> }) | null
    await rec?.load?.()
    // 请求失败 → 兜底内容应保持不变
    if ((rec?.textContent ?? '').includes(c.recTitle)) {
      setFallbackOk(true)
      setStep(4)
    }
  }, [ind, c])

  if (!ind || !c) {
    return (
      <div className="demo-pick">
        {INDUSTRIES.map((i) => {
          const ic = i.copy[lang]
          return (
            <button key={i.id} className="demo-pick-card" onClick={() => setSelected(i.id)}>
              <span className="icon" dangerouslySetInnerHTML={{ __html: i.icon }} />
              <h3>{ic.name}</h3>
              <p>{ic.tagline}</p>
              <span className="go">{t.start}</span>
            </button>
          )
        })}
      </div>
    )
  }

  const stepActions = [
    <button
      key="open"
      className={`demo-action${step === 0 ? ' dp-guide' : ''}`}
      onClick={openPage}
      disabled={step > 0}
    >
      <Play className="h-3.5 w-3.5" /> {t.openBtn}
    </button>,
    <button
      key="publish"
      className={`demo-action${step === 1 ? ' dp-guide' : ''}`}
      onClick={publish}
      disabled={step !== 1}
    >
      <UploadCloud className="h-3.5 w-3.5" /> {t.publishBtn}：{c.promos[1]}
    </button>,
    <div key="ops" className="demo-ops">
      <div className="demo-ops-label">{t.opsPromptCurrent}</div>
      <code className="demo-ops-current">{c.devPrompt}</code>
      <div className="demo-ops-edit">
        <input
          value={promptDraft}
          placeholder={t.opsPromptPlaceholder}
          onChange={(e) => setPromptDraft(e.target.value)}
          disabled={step !== 2}
        />
        <button
          className={`demo-action${step === 2 ? ' dp-guide' : ''}`}
          onClick={applyOps}
          disabled={step !== 2}
        >
          <UploadCloud className="h-3.5 w-3.5" /> {t.opsApply}
        </button>
      </div>
      <div className="demo-chips">
        <button className="demo-chip" onClick={() => setPromptDraft(c.opPrompt)} disabled={step !== 2}>
          <MousePointerClick className="mr-1 inline h-3.5 w-3.5" />
          {t.opsPreset}：{c.opLabel}
        </button>
      </div>
    </div>,
    <button
      key="reload"
      className={`demo-action${step === 3 ? ' dp-guide' : ''}`}
      onClick={() => void reloadRec()}
      disabled={step !== 3}
    >
      <RotateCcw className="h-3.5 w-3.5" /> {t.reloadRec}
    </button>,
  ]

  return (
    <div>
      <div className="mb-4">
        <button className="demo-back" onClick={() => setSelected(null)}>
          <ArrowLeft className="h-3.5 w-3.5" /> {t.change}
        </button>
      </div>
      <div className="demo-play">
        <div className="demo-frame">
          <div className="demo-frame-bar">
            <span className="dot" /><span className="dot" /><span className="dot" />
            <span className="url">{c.url}</span>
          </div>
          <div className="demo-frame-viewport">
            <div ref={stageRef} className={`dp dp-${ind.id}`} />
          </div>
        </div>

        <div className="demo-rail">
          {t.steps.map((s, idx) => {
            const Icon = stepIcons[idx]
            const state = step > idx ? 'done' : step === idx ? 'active' : 'todo'
            return (
              <div key={s.title} className={`demo-step ${state}`}>
                <div className="head">
                  <span className="no">{state === 'done' ? <Check className="h-3 w-3" /> : idx + 1}</span>
                  <h4>{s.title}</h4>
                  <Icon className="ml-auto h-4 w-4 text-muted-foreground" />
                </div>
                {state !== 'todo' && <p className="hint">{s.hint}</p>}
                {idx === 1 && state !== 'todo' && (
                  <div className="ops">
                    <div className="row"><span>{t.opsTitle}</span></div>
                    <div className="row"><span>{t.opsCurrent}</span><b>{step >= 2 ? c.promos[1] : c.promos[0]}</b></div>
                    {step === 1 && <div className="row"><span>{t.opsNext}</span><b>{c.promos[1]}</b></div>}
                  </div>
                )}
                {idx === 3 && state !== 'todo' && <p className="hint">{t.recDown}</p>}
                {idx === 3 && fallbackOk && (
                  <p className="demo-done-note"><Check className="h-3.5 w-3.5" /> {t.fallbackOk}</p>
                )}
                {state === 'active' && stepActions[idx]}
              </div>
            )
          })}
          {step === 4 && (
            <div className="demo-step active">
              <div className="head">
                <span className="no"><Check className="h-3 w-3" /></span>
                <h4>{t.doneTitle}</h4>
              </div>
              <p className="hint">{t.doneHint}</p>
              <div className="demo-rail-footer">
                <button className="demo-action ghost" onClick={() => setNonce((n) => n + 1)}>
                  <RotateCcw className="h-3.5 w-3.5" /> {t.restart}
                </button>
                <button className="demo-action ghost" onClick={() => setSelected(null)}>
                  {t.change}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
