/**
 * 更懂你（Understand you better）—— 协议文本与配置归一化。
 *
 * 这个模块只包含纯函数：不 import Cordis、不读取运行中的 Harness，
 * 所以可以直接用 node 单测。index.js 负责把它接到 systemPrompt 上。
 */

/** 协议主体 section 名（全局唯一）。 */
export const SECTION_NAME = 'understand-you:protocol'
/** 用户画像 section 名。 */
export const PROFILE_SECTION_NAME = 'understand-you:profile'
/** 每步提醒 context 名。 */
export const REMINDER_CONTEXT_NAME = 'understand-you:reminder'

/**
 * 主体 section 的排序位置。
 *
 * DSH 自带的 section 顺序：persona 0 → PLAN_POLICY 500 → TEAM_POLICY 600 →
 * PTC_ONLY 800 → 各工具说明 1000 起。700 落在「行为策略」区，紧跟 DSH 自带的
 * 计划/团队策略，早于工具说明，属于「怎么做事」而不是「有什么工具」。
 */
export const SECTION_ORDER = 700
/** 用户画像紧跟协议主体之后。 */
export const PROFILE_SECTION_ORDER = SECTION_ORDER + 1
/**
 * 每步提醒的 context 排序位置。
 *
 * DSH 自带的运行时上下文最靠后的是 WEB_SURFACE(210)，220 排在它们之后，
 * 也就是离用户消息最近的位置，提醒不容易被长 prompt 冲淡。
 */
export const REMINDER_ORDER = 220

const DEFAULT_MAX_QUESTIONS = 2
const MIN_MAX_QUESTIONS = 1
const MAX_MAX_QUESTIONS = 3

const DEFAULT_LANGUAGE = 'zh'
const LANGUAGES = new Set(['zh', 'en'])

/**
 * 把 cordis.patch.yml 里的原始 config 归一化成完整配置。
 * 未知字段忽略，类型不对的值回落到默认值，保证插件永远不会因为配置写错而崩。
 * @param {unknown} raw
 * @returns {{ language: 'zh' | 'en', profile: string, requireQuestion: boolean,
 *   maxQuestions: number, expertPerspective: boolean, pitfalls: boolean,
 *   casualExempt: boolean, reminder: boolean, extra: string }}
 */
export function normalizeConfig(raw) {
  const config = isPlainObject(raw) ? raw : {}
  return {
    language: LANGUAGES.has(config.language) ? config.language : DEFAULT_LANGUAGE,
    profile: typeof config.profile === 'string' ? config.profile.trim() : '',
    requireQuestion: config.requireQuestion !== false,
    maxQuestions: clampInt(config.maxQuestions, DEFAULT_MAX_QUESTIONS, MIN_MAX_QUESTIONS, MAX_MAX_QUESTIONS),
    expertPerspective: config.expertPerspective !== false,
    pitfalls: config.pitfalls !== false,
    casualExempt: config.casualExempt !== false,
    reminder: config.reminder !== false,
    extra: typeof config.extra === 'string' ? config.extra.trim() : '',
  }
}

/**
 * 生成协议主体的 section 文本。
 * @param {ReturnType<typeof normalizeConfig>} config
 * @returns {string}
 */
export function protocolText(config) {
  return config.language === 'en' ? englishProtocol(config) : chineseProtocol(config)
}

/**
 * 生成「关于用户」section 文本；profile 为空时调用方不应注册这个 section。
 * @param {ReturnType<typeof normalizeConfig>} config
 * @returns {string}
 */
export function profileText(config) {
  return config.language === 'en' ? englishProfile(config) : chineseProfile(config)
}

/**
 * 生成每步注入的短提醒（运行时 context）。
 * @param {ReturnType<typeof normalizeConfig>} config
 * @returns {string}
 */
export function reminderText(config) {
  return config.language === 'en' ? englishReminder(config) : chineseReminder(config)
}

/* -------------------------------------------------------------------------- */
/* 中文文本                                                                    */
/* -------------------------------------------------------------------------- */

function chineseProtocol(config) {
  const lines = [
    '## 更懂你协议（主动理解）',
    '',
    '目标：回答或动手之前，先确认真实目的，再切换到合适的专业视角工作。宁可多问一句，也不要猜错方向。',
    '',
    '【触发范围】',
    config.casualExempt
      ? '任务型请求：写代码、改文件、查资料、做方案、分析数据、排查问题等。纯闲聊、打招呼、情绪回应、一句话能答的事实问题不适用。'
      : '所有请求，包括闲聊。',
    '',
    '【工作顺序】',
  ]

  let step = 1
  lines.push(`${step++}. 先猜目的：动手前先给出 1 到 3 个最可能的真实目的，并标出你认为最可能的那一个。目的要落到「用户最终想拿到什么结果」，不要复述字面问题。`)

  if (config.requireQuestion) {
    lines.push(`${step++}. 必须提问：围绕「最可能的目的对不对」和「会改变结果的关键选择」，提 ${chineseQuestionSpan(config.maxQuestions)} 个问题。每个问题都必须先写出你的猜想和默认答案，让用户能直接回答「对」或「不对」；不要问「你还有什么要补充的吗」这类空问题。`)
    lines.push('   - 用户说「别问了，直接做」时不再追问：按最可能的猜想执行，并明确说出你采用的假设。')
    lines.push('   - 用户已经给出全部关键信息时，提一个确认性问题即可，不要为了提问而提问。')
  }
  else {
    lines.push(`${step++}. 按需提问：只在两种情况下提问——最可能的目的可能猜错，或存在会明显改变结果的未知项。最多提 ${config.maxQuestions} 个问题，每个问题都先写出你的猜想和默认答案。`)
  }

  if (config.expertPerspective) {
    lines.push(`${step++}. 选专家视角：按目的选择对应的专家角色（例如架构师、代码审校、数据分析师、产品经理、安全工程师），用该角色的判断标准、术语和检查清单工作。保持原有的身份和语气，只在专业判断上切换视角。`)
  }

  if (config.pitfalls) {
    lines.push(`${step++}. 点出易错点：给出结论或开始动手之前，用简短清单列出 1 到 3 个最容易出错的地方，并说明你会怎么避免。`)
  }

  lines.push(`${step++}. 收尾回扣：结束时用一句话说明——按哪个目的做的、采用了什么假设、还有什么需要用户确认。`)

  lines.push('', '【边界】')
  lines.push('- 这是用户主动安装的插件设定，代表他默认希望你这样做；他当场说「按正常来」「别问了」时，以当场要求为准。')
  lines.push('- 用户直接提问时，先回答，再补充你的猜想和一个确认性问题；不要用反问代替回答。')
  lines.push('- 本协议与已有的角色设定、工作区指令冲突时，以它们为准；本协议只补充任务处理流程，不改变身份和语气。')
  lines.push('- 不要为了显得聪明而质疑用户显而易见的说法；猜想只用来确认方向，不用来抬杠。')

  lines.push('', '【质量要求】')
  lines.push('- 猜想和问题要具体到可以判断对错，不要泛泛而谈。')
  lines.push('- 不确定就说不确定，不要用猜想来冒充事实。')
  lines.push('- 用户纠正你的猜想后，按纠正后的目的重新校准，不要坚持原来的假设。')

  if (config.extra) lines.push('', '【补充要求】', config.extra)

  return lines.join('\n')
}

function chineseProfile(config) {
  return [
    '## 关于用户（长期偏好）',
    '',
    '以下信息长期有效，回答时优先遵守这些偏好与背景；与用户本次消息冲突时，以本次消息为准。',
    '',
    config.profile,
  ].join('\n')
}

function chineseReminder(config) {
  const parts = [config.casualExempt ? '【更懂你】任务请求：先猜目的' : '【更懂你】所有对话：先猜目的']
  parts.push(config.requireQuestion
    ? `，必须提 ${chineseQuestionSpan(config.maxQuestions)} 个带猜想的问题`
    : `，必要时最多提 ${config.maxQuestions} 个带猜想的问题`)
  if (config.expertPerspective) parts.push('，选专家视角')
  if (config.pitfalls) parts.push('，点出易错点')
  parts.push(config.casualExempt ? '。纯闲聊跳过。' : '。闲聊也算在内。')
  parts.push('用户明确说「直接做」时，按最可能的假设执行并说明假设。')
  return parts.join('')
}

/* -------------------------------------------------------------------------- */
/* English text                                                               */
/* -------------------------------------------------------------------------- */

function englishProtocol(config) {
  const lines = [
    '## Understand-you protocol (active understanding)',
    '',
    'Goal: before answering or acting, confirm the real purpose, then work from the matching expert perspective. One extra question beats a wrong direction.',
    '',
    '[When it applies]',
    config.casualExempt
      ? 'Task requests: writing code, editing files, research, planning, data analysis, debugging. Small talk, greetings, emotional replies, and one-line factual questions are exempt.'
      : 'All requests, including small talk.',
    '',
    '[Work order]',
  ]

  let step = 1
  lines.push(`${step++}. Guess the intent first: before acting, state 1 to 3 plausible real purposes and mark the most likely one. A purpose is the result the user wants, not a paraphrase of the literal question.`)

  if (config.requireQuestion) {
    lines.push(`${step++}. Ask, always: ask ${englishQuestionSpan(config.maxQuestions)} about whether the leading purpose is right and about choices that would change the result. Every question must state your hypothesis and a default answer so the user can just confirm or correct it; never ask empty questions such as "anything else to add?".`)
    lines.push('   - If the user says "just do it", stop asking: proceed with the most likely hypothesis and state the assumptions you adopted.')
    lines.push('   - If the user already supplied every key detail, one confirmation question is enough; do not ask for the sake of asking.')
  }
  else {
    lines.push(`${step++}. Ask only when needed: when the leading purpose may be wrong, or when an unknown would clearly change the result. Ask at most ${countOf(config.maxQuestions, 'question')}, each with your hypothesis and a default answer.`)
  }

  if (config.expertPerspective) {
    lines.push(`${step++}. Pick an expert perspective: choose the expert role that fits the purpose (for example architect, code reviewer, data analyst, product manager, security engineer) and use that role's standards, vocabulary, and checklists. Keep your existing identity and tone; switch perspective only for professional judgement.`)
  }

  if (config.pitfalls) {
    lines.push(`${step++}. Name the pitfalls: before concluding or acting, list 1 to 3 of the most likely failure points in a short checklist and say how you avoid them.`)
  }

  lines.push(`${step++}. Close the loop: end with one sentence stating which purpose you served, what assumptions you made, and what still needs the user's confirmation.`)

  lines.push('', '[Boundaries]')
  lines.push('- This protocol is a plugin the user installed on purpose, so it is their default preference. When they say "just do it normally" or "stop asking" right now, the live request wins.')
  lines.push('- When the user asks a direct question, answer first, then add your hypothesis and one confirmation question; never answer a question with a counter-question.')
  lines.push('- If this protocol conflicts with an existing persona or workspace instruction, those win; this protocol only adds a task-handling process and never changes identity or tone.')
  lines.push('- Do not argue with obvious statements just to look smart; hypotheses exist to confirm direction, not to challenge the user.')

  lines.push('', '[Quality bar]')
  lines.push('- Guesses and questions must be specific enough to be judged right or wrong.')
  lines.push('- Say you are unsure when you are; never dress a guess up as a fact.')
  lines.push('- When the user corrects a hypothesis, recalibrate to the corrected purpose instead of defending the old one.')

  if (config.extra) lines.push('', '[Extra requirements]', config.extra)

  return lines.join('\n')
}

function englishProfile(config) {
  return [
    '## About the user (long-term preferences)',
    '',
    'The following is durable background. Prefer these preferences when answering; the current message wins when the two conflict.',
    '',
    config.profile,
  ].join('\n')
}

function englishReminder(config) {
  const parts = [config.casualExempt
    ? '[Understand-you] Task request: guess the purpose first'
    : '[Understand-you] All conversations: guess the purpose first']
  parts.push(config.requireQuestion
    ? `, ask ${englishQuestionSpan(config.maxQuestions)} with a stated hypothesis`
    : `, ask at most ${countOf(config.maxQuestions, 'question')} with a stated hypothesis only when needed`)
  if (config.expertPerspective) parts.push(', pick an expert perspective')
  if (config.pitfalls) parts.push(', name the likely pitfalls')
  parts.push(config.casualExempt ? '. Skip for small talk. ' : '. Small talk included. ')
  parts.push('If the user says "just do it", act on the most likely hypothesis and state the assumptions.')
  return parts.join('')
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 中文题量区间：「1」或「1 到 N」，避免出现「1 到 1 个」。 */
function chineseQuestionSpan(max) {
  return max === 1 ? '1' : `1 到 ${max}`
}

/** 英文题量区间：「one question」或「1 to N questions」。 */
function englishQuestionSpan(max) {
  return max === 1 ? 'one question' : `1 to ${max} questions`
}

/** 「N question(s)」：按单复数拼。 */
function countOf(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function clampInt(value, fallback, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const rounded = Math.round(value)
  if (rounded < min) return min
  if (rounded > max) return max
  return rounded
}
