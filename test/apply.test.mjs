import assert from 'node:assert/strict'
import test from 'node:test'

import { apply, inject, name } from '../index.js'
import {
  PROFILE_SECTION_NAME,
  PROFILE_SECTION_ORDER,
  REMINDER_CONTEXT_NAME,
  REMINDER_ORDER,
  SECTION_NAME,
  SECTION_ORDER,
  normalizeConfig,
  profileText,
  protocolText,
  reminderText,
} from '../src/protocol.js'

/** 最小可用的假 ctx：只实现本插件碰到的两个注册方法。 */
function fakeContext() {
  const sections = []
  const contexts = []
  const effects = []
  const ctx = {
    effect(factory, label) {
      effects.push(label)
      return factory()
    },
    systemPrompt: {
      section(section) {
        sections.push(section)
        return () => {}
      },
      context(context) {
        contexts.push(context)
        return () => {}
      },
    },
  }
  return { ctx, sections, contexts, effects }
}

test('插件导出名与依赖符合 Host 插件约定', () => {
  assert.equal(name, 'understand-you')
  assert.deepEqual(inject, ['systemPrompt'])
})

test('默认配置：注册协议 section 和一条每步提醒', () => {
  const { ctx, sections, contexts, effects } = fakeContext()
  apply(ctx, undefined)

  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, SECTION_NAME)
  assert.equal(sections[0].order, SECTION_ORDER)
  assert.equal(sections[0].interpolate, false)
  assert.match(sections[0].text, /必须提问/)
  assert.match(sections[0].text, /1 到 2 个问题/)
  assert.match(sections[0].text, /专家视角/)
  assert.match(sections[0].text, /易错点/)
  assert.deepEqual(effects, ['understand-you.protocol', 'understand-you.reminder'])

  assert.equal(contexts.length, 1)
  assert.equal(contexts[0].name, REMINDER_CONTEXT_NAME)
  assert.equal(contexts[0].order, REMINDER_ORDER)
  assert.match(contexts[0].text, /猜目的/)
})

test('profile 非空时额外注册「关于用户」section', () => {
  const { ctx, sections } = fakeContext()
  apply(ctx, { profile: '  回答尽量短，先给结论  ' })

  assert.equal(sections.length, 2)
  assert.equal(sections[1].name, PROFILE_SECTION_NAME)
  assert.equal(sections[1].order, PROFILE_SECTION_ORDER)
  assert.match(sections[1].text, /回答尽量短，先给结论/)
})

test('reminder: false 时不注册运行时提醒', () => {
  const { ctx, contexts, effects } = fakeContext()
  apply(ctx, { reminder: false })

  assert.equal(contexts.length, 0)
  assert.deepEqual(effects, ['understand-you.protocol'])
})

test('开关关闭时对应步骤从文本里消失', () => {
  const { ctx, sections } = fakeContext()
  apply(ctx, { requireQuestion: false, expertPerspective: false, pitfalls: false })
  const text = sections[0].text

  assert.doesNotMatch(text, /必须提问/)
  assert.match(text, /按需提问/)
  assert.doesNotMatch(text, /专家视角/)
  assert.doesNotMatch(text, /点出易错点/)
})

test('casualExempt 控制触发范围文案', () => {
  assert.match(protocolText(normalizeConfig({})), /任务型请求/)
  assert.match(protocolText(normalizeConfig({ casualExempt: false })), /所有请求，包括闲聊/)
})

test('extra 追加在文本末尾', () => {
  const { ctx, sections } = fakeContext()
  apply(ctx, { extra: '每次回答末尾附上饭桶指数。' })
  assert.match(sections[0].text, /【补充要求】\n每次回答末尾附上饭桶指数。/)
})

test('language 切换英文文本', () => {
  const text = protocolText(normalizeConfig({ language: 'en', maxQuestions: 3 }))
  assert.match(text, /Guess the intent first/)
  assert.match(text, /Ask, always/)
  assert.match(text, /1 to 3 question/)
  assert.match(reminderText(normalizeConfig({ language: 'en' })), /Understand-you/)
  assert.match(profileText(normalizeConfig({ language: 'en', profile: 'Likes short answers.' })), /Likes short answers./)
})

test('错误配置被安全归一化，不抛错', () => {
  const config = normalizeConfig({
    language: 'xx',
    profile: 42,
    maxQuestions: 99,
    requireQuestion: 'no',
    extra: null,
  })
  assert.equal(config.language, 'zh')
  assert.equal(config.profile, '')
  assert.equal(config.maxQuestions, 3)
  assert.equal(config.requireQuestion, true)
  assert.equal(config.extra, '')
  assert.equal(normalizeConfig(null).maxQuestions, 2)
  assert.equal(normalizeConfig({ maxQuestions: 0 }).maxQuestions, 1)
  assert.equal(normalizeConfig('nope').language, 'zh')

  const { ctx } = fakeContext()
  assert.doesNotThrow(() => apply(ctx, 'not-an-object'))
})

test('用户 extra 里的花括号原样保留，且 section 关闭变量插值', () => {
  const text = protocolText(normalizeConfig({ extra: 'x {{ not_a_var }} y' }))
  assert.match(text, /\{\{ not_a_var \}\}/)

  const { ctx, sections } = fakeContext()
  apply(ctx, { extra: 'x {{ not_a_var }} y' })
  assert.equal(sections[0].interpolate, false)
})

test('maxQuestions: 1 时用单数，不出现「1 到 1」', () => {
  const config = normalizeConfig({ maxQuestions: 1 })
  assert.doesNotMatch(protocolText(config), /1 到 1/)
  assert.match(protocolText(config), /提 1 个问题/)
  assert.match(reminderText(config), /必须提 1 个带猜想的问题/)

  const en = normalizeConfig({ language: 'en', maxQuestions: 1 })
  assert.doesNotMatch(protocolText(en), /1 to 1/)
  assert.match(protocolText(en), /ask one question/)
  assert.match(reminderText(en), /ask one question/)
})

test('casualExempt: false 时提醒不再说「纯闲聊跳过」，前缀也换成所有对话', () => {
  const config = normalizeConfig({ casualExempt: false })
  assert.match(reminderText(config), /所有对话：先猜目的/)
  assert.doesNotMatch(reminderText(config), /任务请求：/)
  assert.match(reminderText(config), /闲聊也算在内/)
  assert.doesNotMatch(reminderText(config), /纯闲聊跳过/)

  const en = normalizeConfig({ language: 'en', casualExempt: false })
  assert.match(reminderText(en), /All conversations: guess the purpose first/)
  assert.doesNotMatch(reminderText(en), /Task request:/)
  assert.doesNotMatch(reminderText(en), /Skip for small talk/)
  assert.match(reminderText(en), /Small talk included/)
})

test('requireQuestion: false 时提醒跟随 maxQuestions', () => {
  const config = normalizeConfig({ requireQuestion: false, maxQuestions: 3 })
  assert.match(protocolText(config), /最多提 3 个问题/)
  assert.match(reminderText(config), /最多提 3 个/)

  const en = normalizeConfig({ language: 'en', requireQuestion: false, maxQuestions: 3 })
  assert.match(protocolText(en), /at most 3 questions/)
  assert.match(reminderText(en), /at most 3 questions/)
})

test('英文提醒句子之间有空格，不粘句', () => {
  for (const casualExempt of [true, false]) {
    const text = reminderText(normalizeConfig({ language: 'en', casualExempt }))
    assert.doesNotMatch(text, /\.\S/)
    assert.doesNotMatch(text, /talk\.If/)
  }
})
