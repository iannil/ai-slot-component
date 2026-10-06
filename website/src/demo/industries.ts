/**
 * 四个行业的演示数据（双语）。页面模板见 pages.ts；
 * 这里承载驱动演示逻辑所需的全部可变文案：AI 标题、促销/导读版本轮换、
 * 运营预设卖点方向（控制台一键切换）、兜底检测文本。
 */
import { icon } from './icons'

export type DemoLang = 'zh' | 'en'
export type IndustryId = 'shop' | 'hotel' | 'news' | 'fin'

export interface IndustryCopy {
  /** 行业选择卡片 */
  name: string
  tagline: string
  /** 浏览器框地址栏 */
  url: string
  /** hero-banner 行业的 AI 标题；markdown 行业（news）为空串 */
  heroTitle: string
  /** live 轮换：步骤 1 上屏 promos[0]，发布后变为 promos[1] */
  promos: string[]
  /** 当前生效的开发者提示词（控制台「当前」展示） */
  devPrompt: string
  /** 预设卖点方向：控制台一键切换 */
  opLabel: string
  opPrompt: string
  /** 切换到预设方向后的输出 */
  opTitle: string
  opSubtitle: string
  /** 步骤 3 完成检测文本（hero 槽位内出现即视为完成） */
  doneOp: string
  /** 推荐位静态标题（步骤 4 兜底检测） */
  recTitle: string
}

export interface Industry {
  id: IndustryId
  /** 行业选择卡片图标（内联 SVG，见 icons.ts） */
  icon: string
  /** hero 槽位组件类型 */
  heroComponent: 'hero-banner' | 'markdown-block'
  copy: Record<DemoLang, IndustryCopy>
}

export const INDUSTRIES: Industry[] = [
  {
    id: 'shop',
    icon: icon('bag', 26),
    heroComponent: 'hero-banner',
    copy: {
      zh: {
        name: '电商零售 · 老友商城',
        tagline: '3C 数码产品详情页：AI 优化卖点文案，运营改促销免发版生效。',
        url: 'demo.aislot.dev/shop.html',
        heroTitle: '降噪耳机 X100：地铁再吵，只剩音乐',
        promos: ['¥199 · 今日下单享 8 折', '¥159 · 限时秒杀，今晚 24 点截止'],
        devPrompt: '面向通勤族，突出降噪效果和佩戴舒适',
        opLabel: '学生党方向',
        opPrompt: '面向学生党，突出性价比与宿舍降噪',
        opTitle: '学生党闭眼入的降噪耳机',
        opSubtitle: '¥199 · 学生认证再减 20',
        doneOp: '学生党闭眼入的降噪耳机',
        recTitle: '为您推荐',
      },
      en: {
        name: 'E-commerce · Old Pal Shop',
        tagline: 'A 3C product page: AI-polished selling points, deal changes without redeploys.',
        url: 'demo.aislot.dev/shop.html',
        heroTitle: 'X100: the subway disappears, the music stays',
        promos: ['$29.99 · 20% off today', '$24.99 · flash sale ends at midnight'],
        devPrompt: 'For commuters, emphasize noise canceling and all-day comfort',
        opLabel: 'Student angle',
        opPrompt: 'Pitch it to students: value and dorm-friendly noise canceling',
        opTitle: 'The student pick for deep focus',
        opSubtitle: '$29.99 · extra 10% off with student ID',
        doneOp: 'The student pick for deep focus',
        recTitle: 'You may also like',
      },
    },
  },
  {
    id: 'hotel',
    icon: icon('building', 26),
    heroComponent: 'hero-banner',
    copy: {
      zh: {
        name: '酒店旅游 · 栖澜西湖酒店',
        tagline: '酒店预订详情页：AI 重写酒店卖点，房价套餐变更实时推送。',
        url: 'demo.aislot.dev/hotel.html',
        heroTitle: '推窗见西湖：把断桥残雪装进清晨',
        promos: ['¥899/晚 · 含双早+欢迎茶点', '¥799/晚 · 周中特惠，限量 20 间'],
        devPrompt: '面向周末度假的夫妻与家庭客，突出湖景与步行可达的景点',
        opLabel: '带父母出行方向',
        opPrompt: '面向带父母出行的家庭客，突出安静与无障碍',
        opTitle: '带父母住：安静庭院房，电梯直达',
        opSubtitle: '¥899/晚 · 可备注低楼层安静房',
        doneOp: '带父母住：安静庭院房，电梯直达',
        recTitle: '周边推荐',
      },
      en: {
        name: 'Travel · Xilan Westlake Hotel',
        tagline: 'A hotel booking page: AI rewrites the pitch, rate changes push live.',
        url: 'demo.aislot.dev/hotel.html',
        heroTitle: 'Wake up to West Lake, Broken Bridge at dawn',
        promos: ['$129/night · breakfast + welcome tea', '$115/night · midweek special, 20 rooms'],
        devPrompt: 'For weekend couples and families; lake view and walkable sights',
        opLabel: 'With-parents angle',
        opPrompt: 'For guests traveling with parents: quiet rooms, elevator access',
        opTitle: 'With parents: quiet courtyard, elevator access',
        opSubtitle: '$129/night · quiet low-floor rooms on request',
        doneOp: 'With parents: quiet courtyard, elevator access',
        recTitle: 'Nearby picks',
      },
    },
  },
  {
    id: 'news',
    icon: icon('newspaper', 26),
    heroComponent: 'markdown-block',
    copy: {
      zh: {
        name: '新闻资讯 · 前沿观察',
        tagline: '科技媒体文章页：AI 生成「要点速览」导读，快讯更新即时修订。',
        url: 'demo.aislot.dev/news.html',
        heroTitle: '',
        promos: [
          '导读：新一代推理引擎将调用成本降至原来的 30%，首批 200 家厂商完成接入；开发者价格同步下调，小团队第一次用得起工业级推理。',
          '更新：官方确认本轮融资 5 亿美元，资金主要投向推理芯片自研；导读已补充投资方名单。',
        ],
        devPrompt: '用 3 分钟导读的口吻，写给时间有限的行业读者',
        opLabel: '一句话版（给外行）',
        opPrompt: '给外行读者一句话版本',
        opTitle: '',
        opSubtitle: '一句话：AI 调用更便宜了，做应用的创业公司会变多。',
        doneOp: '一句话：AI 调用更便宜了',
        recTitle: '相关阅读',
      },
      en: {
        name: 'News · Frontline Observer',
        tagline: 'A tech-news article: AI brief, breaking updates revised in place.',
        url: 'demo.aislot.dev/news.html',
        heroTitle: '',
        promos: [
          'Brief: the new inference engine cuts call costs to 30%; 200 vendors onboarded in 48 hours — small teams can finally afford industrial-grade inference.',
          'Update: the company confirmed a $500M round, mostly for in-house inference chips; investor list added to the brief.',
        ],
        devPrompt: 'A 3-minute brief for busy industry readers',
        opLabel: 'One-liner for laypeople',
        opPrompt: 'One sentence for lay readers',
        opTitle: '',
        opSubtitle: 'One-liner: AI calls just got cheaper — expect a wave of new app startups.',
        doneOp: 'One-liner: AI calls just got cheaper',
        recTitle: 'Related reading',
      },
    },
  },
  {
    id: 'fin',
    icon: icon('landmark', 26),
    heroComponent: 'hero-banner',
    copy: {
      zh: {
        name: '金融理财 · 恒信银行',
        tagline: '银行理财产品页：AI 打磨产品亮点，年化与额度变更实时生效。',
        url: 'demo.aislot.dev/fin.html',
        heroTitle: '稳盈 180 天：给闲钱一个半程加油站',
        promos: ['七日年化 2.85% · 1 元起购', '七日年化 2.91% · 新客专享加息券'],
        devPrompt: '面向有闲钱的工薪族，突出稳健与流动性安排，避免收益承诺',
        opLabel: '保守型投资者方向',
        opPrompt: '面向保守型投资者，先讲风险与兑付记录',
        opTitle: '给保守型投资者：先看清这三点',
        opSubtitle: 'R2 稳健 · 历史全部按期兑付 · 180 天封闭',
        doneOp: '给保守型投资者：先看清这三点',
        recTitle: '相似产品',
      },
      en: {
        name: 'Finance · Hengxin Bank',
        tagline: 'A wealth product page: AI-tuned highlights, yield updates go live instantly.',
        url: 'demo.aislot.dev/fin.html',
        heroTitle: 'Steady 180: a halfway pit stop for idle cash',
        promos: ['7-day yield 2.85% · from $1', '7-day yield 2.91% · new-client coupon'],
        devPrompt: 'For salaried savers: steadiness and liquidity, no yield promises',
        opLabel: 'Conservative-investor angle',
        opPrompt: 'For conservative investors: risks and repayment record first',
        opTitle: 'For conservative investors: three things first',
        opSubtitle: 'R2 · every past term repaid · 180-day lock-in',
        doneOp: 'For conservative investors: three things first',
        recTitle: 'Similar products',
      },
    },
  },
]

export function industryById(id: IndustryId): Industry {
  return INDUSTRIES.find((i) => i.id === id)!
}
