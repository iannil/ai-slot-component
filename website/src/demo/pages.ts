/**
 * 演示页模板：与 examples/plain-html 的行业页同设计语言，宽度适配演示框（约 780px）。
 * AI 槽位以 <div class="slot-mount"> 占位存在——用户点击「打开页面」后才替换为
 * 真实 <ai-slot> 元素并触发加载，保证演示没有自动播放，每一步都是手动操作。
 */
import type { DemoLang, IndustryId } from './industries'
import { icon } from './icons'

function slotMount(name: string, opts: { rec?: boolean }, fallback: string): string {
  const attrs = opts.rec ? '' : ' data-stream data-live'
  const cls = opts.rec ? 'slot-mount rec' : 'slot-mount'
  return `<div class="${cls}" data-name="${name}"${attrs}>${fallback}</div>`
}

function shop(lang: DemoLang): string {
  const zh = lang === 'zh'
  return `
  <header class="topbar">
    <span class="logo">${zh ? '老友商城' : 'Old Pal Shop'}</span>
    <nav><span>${zh ? '首页' : 'Home'}</span><span>${zh ? '分类' : 'Categories'}</span><span>${zh ? '限时秒杀' : 'Flash Sale'}</span></nav>
    <span class="cart">${zh ? '购物车 (2)' : 'Cart (2)'}</span>
  </header>
  <div class="crumbs">${zh ? '首页 / 数码影音 / 耳机耳麦 / <b>降噪耳机 X100</b>' : 'Home / Electronics / Headphones / <b>X100 Headphones</b>'}</div>
  <main class="product">
    <div class="photo">${icon('headphones', 84, '#cbd5e1')}</div>
    <div class="info">
      ${slotMount('shop-hero', {}, zh
        ? '<h1>降噪耳机 X100</h1><p>音质好，佩戴舒适。</p>'
        : '<h1>X100 Noise-Canceling Headphones</h1><p>Good sound. Comfortable fit.</p>')}
      <div class="price-row">
        <span class="price">${zh ? '¥199' : '$29.99'}</span><s>${zh ? '¥249' : '$39.99'}</s><span class="tag">${zh ? '限时优惠' : 'Limited offer'}</span>
      </div>
      <div class="meta"><span><i class="star">★</i> 4.9（${zh ? '12,847 条评价' : '12,847 reviews'}）</span><span>·</span><span>${zh ? '月销 2.3 万' : '23k sold/mo'}</span></div>
      <div class="sku">
        <dt>${zh ? '颜色' : 'Color'}</dt>
        <dd><span class="on">${zh ? '曜石黑' : 'Black'}</span><span>${zh ? '月光白' : 'White'}</span></dd>
      </div>
      <div class="service"><span><i>✓</i>${zh ? '7 天无理由' : '7-day returns'}</span><span><i>✓</i>${zh ? '一年质保' : '1-yr warranty'}</span><span><i>✓</i>${zh ? '顺丰包邮' : 'Free shipping'}</span></div>
      <div class="actions"><button class="cart-btn">${zh ? '加入购物车' : 'Add to cart'}</button><button class="buy">${zh ? '立即购买' : 'Buy now'}</button></div>
    </div>
  </main>
  <section class="panel">
    <h2>${zh ? '买家评价' : 'Reviews'} <em>（12,847）</em></h2>
    <div class="review"><div class="who"><span class="star">★★★★★</span> j***8 · 2026-09-28</div>${zh
      ? '地铁通勤戴了一周，降噪一开世界就安静了。'
      : 'A week of subway commutes: flip on ANC and the world goes quiet.'}</div>
  </section>
  ${slotMount('shop-rec', { rec: true }, zh
    ? '<h2>为您推荐</h2><p>耳塞套 · 收纳盒 · 延保服务</p>'
    : '<h2>You may also like</h2><p>Ear tips · Carrying case · Extended warranty</p>')}
  <footer class="footer">${zh ? '老友商城 · 隐私政策 · 联系客服' : 'Old Pal Shop · Privacy · Support'}</footer>`
}

function hotel(lang: DemoLang): string {
  const zh = lang === 'zh'
  return `
  <header class="topbar">
    <span class="logo">${zh ? '栖澜酒店集团' : 'Xilan Hotels'}</span>
    <nav><span>${zh ? '酒店' : 'Hotels'}</span><span>${zh ? '民宿' : 'B&Bs'}</span><span>${zh ? '机票' : 'Flights'}</span></nav>
    <span class="member">${zh ? '金卡会员 · 积分 12,400' : 'Gold · 12,400 pts'}</span>
  </header>
  <div class="crumbs">${zh ? '杭州酒店 / 西湖风景区 / <b>栖澜·西湖度假酒店</b>' : 'Hangzhou / West Lake / <b>Xilan Westlake Resort</b>'}</div>
  <div class="gallery"><div class="main">${icon('waves', 56, '#e0f2fe')}</div><div class="g2">${icon('bed', 34, '#99f6e4')}</div><div class="g3">${icon('coffee', 34, '#d9f99d')}</div></div>
  <main class="hotel">
    <div>
      ${slotMount('hotel-hero', {}, zh
        ? '<h1>栖澜·西湖度假酒店</h1><p>位置好，风景不错。</p>'
        : '<h1>Xilan Westlake Resort</h1><p>Great location, nice views.</p>')}
      <div class="score"><b>4.8</b><span>${zh ? '3,214 条评价 ·「湖景无敌」「服务贴心」' : '3,214 reviews · “lake view”, “great service”'}</span></div>
      <p class="addr">${icon('pin', 13, '#0c4a6e', 'vertical-align:-2px;margin-right:2px')}${zh ? '杭州 · 西湖区北山街 27 号 · 距断桥残雪步行 6 分钟' : '27 Beishan St, Hangzhou · 6-min walk to Broken Bridge'}</p>
      <div class="tags">${zh
        ? '<span>湖景房</span><span>含双早</span><span>免费取消</span><span>近地铁</span>'
        : '<span>Lake view</span><span>Breakfast</span><span>Free cancel</span><span>Near metro</span>'}</div>
      <section class="rooms">
        <h2>${zh ? '房型与价格' : 'Rooms & rates'}</h2>
        <div class="room"><div class="pic">${icon('bed', 24, '#075985')}</div>
          <div><div class="name">${zh ? '湖景大床房' : 'Lake-view King'}</div><div class="desc">${zh ? '38㎡ · 含双早 · 落地窗直面西湖' : '38㎡ · breakfast · floor-to-ceiling lake view'}</div></div>
          <div class="price"><b>${zh ? '¥899' : '$129'}</b><i>${zh ? '/晚' : '/night'}</i><button>${zh ? '预订' : 'Book'}</button></div>
        </div>
        <div class="room"><div class="pic">${icon('sprout', 24, '#3f6212')}</div>
          <div><div class="name">${zh ? '庭院双床房' : 'Courtyard Twin'}</div><div class="desc">${zh ? '32㎡ · 含双早 · 内庭花园景观' : '32㎡ · breakfast · garden view'}</div></div>
          <div class="price"><b>${zh ? '¥699' : '$99'}</b><i>${zh ? '/晚' : '/night'}</i><button>${zh ? '预订' : 'Book'}</button></div>
        </div>
      </section>
    </div>
    <aside class="side-card">
      <h3>${zh ? '酒店设施' : 'Amenities'}</h3>
      <ul><li><i>✓</i>${zh ? '免费停车场' : 'Free parking'}</li><li><i>✓</i>${zh ? '健身房 · 茶室' : 'Gym · Tea room'}</li><li><i>✓</i>${zh ? '儿童乐园' : 'Kids club'}</li></ul>
    </aside>
  </main>
  ${slotMount('hotel-rec', { rec: true }, zh
    ? '<h2>周边推荐</h2><p>曲院风荷 · 楼外楼 · 手摇船码头</p>'
    : '<h2>Nearby picks</h2><p>Quyuan Garden · Lou Wai Lou · Rowing dock</p>')}
  <footer class="footer">${zh ? '栖澜酒店集团 · 预订热线 400-800-1024' : 'Xilan Hotels · 400-800-1024'}</footer>`
}

function news(lang: DemoLang): string {
  const zh = lang === 'zh'
  return `
  <header class="topbar">
    <span class="logo">${zh ? '前沿观察' : 'Frontline'}</span>
    <nav><span>${zh ? '要闻' : 'Top'}</span><span>${zh ? '科技' : 'Tech'}</span><span>${zh ? '财经' : 'Finance'}</span><span>${zh ? '深度' : 'Features'}</span></nav>
    <span class="sub-btn">${zh ? '订阅会员' : 'Subscribe'}</span>
  </header>
  <div class="article">
    <p class="channel">${zh ? '科技 · 人工智能' : 'Tech · AI'}</p>
    <h1 class="headline">${zh
      ? '国产大模型推理成本再降 70%，开发者生态迎来拐点'
      : 'Domestic LLM inference costs drop another 70% — a turning point for developers'}</h1>
    <div class="byline"><span>${zh ? '记者 林澜' : 'Lin Lan'}</span><span>2026-10-06 09:41</span><span>${zh ? '阅读 8.2 万' : '82k reads'}</span></div>
    <h2 class="digest-label">${zh ? 'AI 导读 · 要点速览' : 'AI BRIEF'}</h2>
    ${slotMount('news-hero', {}, zh
      ? '<div class="digest"><p>推理成本大幅下降，开发者生态受益。</p></div>'
      : '<div class="digest"><p>Inference costs are way down; developers benefit.</p></div>')}
    <p class="body">${zh
      ? '10 月 5 日，澜舟智能正式发布新一代推理引擎「流火 2.0」。官方数据显示，在同等并发下，千亿参数模型的单次调用成本降至上一代产品的 30%。'
      : 'On Oct 5, Lanzhou Intelligence unveiled its next-gen inference engine Liuhuo 2.0. At equal concurrency, per-call cost of a 100B model drops to 30% of the previous generation.'}</p>
    <p class="body">${zh
      ? '成本下探直接点燃了开发者侧的热情。发布 48 小时内，官方披露已有 200 家厂商完成接入，覆盖办公、电商客服、教育辅导等场景。'
      : 'Cheaper inference lit up the developer community. Within 48 hours, 200 vendors onboarded — office tools, e-commerce support, tutoring apps.'}</p>
    <div class="figure">${icon('chart', 48, '#d6d3d1')}</div>
    <p class="caption">${zh ? '「流火 2.0」与上一代产品的单位推理成本对比（官方数据）' : 'Unit inference cost vs. previous generation (official data)'}</p>
  </div>
  ${slotMount('news-rec', { rec: true }, zh
    ? '<h2>相关阅读</h2><p>大模型价格战始末 · 推理优化入门</p>'
    : '<h2>Related reading</h2><p>The LLM price war, explained · Inference optimization 101</p>')}
  <footer class="footer">${zh ? '前沿观察 · 未经授权不得转载' : 'Frontline Observer · All rights reserved'}</footer>`
}

function fin(lang: DemoLang): string {
  const zh = lang === 'zh'
  return `
  <header class="topbar">
    <span class="logo">${zh ? '恒信银行' : 'Hengxin Bank'}</span>
    <nav><span>${zh ? '首页' : 'Home'}</span><span>${zh ? '理财' : 'Wealth'}</span><span>${zh ? '基金' : 'Funds'}</span><span>${zh ? '我的账户' : 'Account'}</span></nav>
    <span class="phone">${zh ? '客服热线 95588' : 'Hotline 95588'}</span>
  </header>
  <div class="crumbs">${zh ? '理财 / 固定收益 / <b>稳盈 180 天·固收增强</b>' : 'Wealth / Fixed income / <b>Steady 180 · Enhanced</b>'}</div>
  <main class="product">
    <div>
      ${slotMount('fin-hero', {}, zh
        ? '<h1>稳盈 180 天·固收增强</h1><p>稳健理财，期限适中。</p>'
        : '<h1>Steady 180 · Fixed Income+</h1><p>Steady growth, moderate term.</p>')}
      <div class="badges"><span>${zh ? 'R2 稳健型' : 'R2 steady'}</span><span>${zh ? '固收增强' : 'Enhanced FI'}</span><span>${zh ? '银行自营' : 'Bank-managed'}</span></div>
      <table class="facts">
        <tr><td>${zh ? '产品期限' : 'Term'}</td><td>${zh ? '180 天封闭期，到期自动赎回' : '180-day lock-in, auto redemption'}</td></tr>
        <tr><td>${zh ? '起购金额' : 'Minimum'}</td><td>${zh ? '1 元，1 元递增' : '$1, increments of $1'}</td></tr>
        <tr><td>${zh ? '风险等级' : 'Risk'}</td><td>${zh ? 'R2（稳健型），适合保守型及以上投资者' : 'R2 (steady), for conservative investors and up'}</td></tr>
        <tr><td>${zh ? '管理人' : 'Manager'}</td><td>${zh ? '恒信银行资产管理部' : 'Hengxin Bank Asset Mgmt'}</td></tr>
      </table>
    </div>
    <aside class="yield-card">
      <div class="num">2.85<i>%</i></div>
      <div class="cap">${zh ? '七日年化收益率（2026-10-05）' : '7-day annualized (2026-10-05)'}</div>
      <hr />
      <div class="row"><span>${zh ? '本期额度' : 'Quota'}</span><span>${zh ? '剩余 38%' : '38% left'}</span></div>
      <div class="row"><span>${zh ? '已申购人数' : 'Investors'}</span><span>41,206</span></div>
      <button>${zh ? '立即买入' : 'Invest now'}</button>
    </aside>
  </main>
  <section class="panel">
    <h2>${zh ? '产品说明' : 'About this product'}</h2>
    <ul>${zh
      ? '<li>主要投资于利率债与高等级信用债，权益类仓位不超过 20%。</li><li>封闭期内不可赎回，请合理安排资金。</li>'
      : '<li>Invests mainly in rate bonds and high-grade credit; equity ≤ 20%.</li><li>No redemption during the lock-in period.</li>'}</ul>
  </section>
  ${slotMount('fin-rec', { rec: true }, zh
    ? '<h2>相似产品</h2><p>稳盈 90 天 · 季季盈 · 安享货币 A</p>'
    : '<h2>Similar products</h2><p>Steady 90 · Quarterly Gain · Money Fund A</p>')}
  <footer class="footer">${zh
    ? '理财非存款，产品有风险，投资须谨慎。'
    : 'Wealth products are not deposits. Invest with care.'}</footer>`
}

const renderers: Record<IndustryId, (lang: DemoLang) => string> = { shop, hotel, news, fin }

/** 静态页 HTML：AI 槽位处于占位状态（仅兜底内容），等待用户手动「打开页面」。 */
export function renderPage(id: IndustryId, lang: DemoLang): string {
  return renderers[id](lang)
}
