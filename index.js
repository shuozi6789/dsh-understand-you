/**
 * 更懂你（Understand you better）—— DSH Host 插件。
 *
 * 作用：给每个会话的 system prompt 增加一套「主动理解」协议 ——
 *   1. 任务开始前先猜用户的真实目的；
 *   2. 必须提出带猜想的问题（默认 1~2 个，可配置）；
 *   3. 按目的切换到对应的专家视角；
 *   4. 动手前点出容易出错的地方；
 *   5. 收尾时回扣目的与假设。
 * 另外可选注入一段「关于用户」的长期偏好，以及每条消息前的短提醒。
 *
 * 本插件只增加 prompt 文本，不注册工具、不改工具权限、不写会话日志。
 * 文本与配置归一化放在 ./src/protocol.js，可脱离 Harness 单测。
 */

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
} from './src/protocol.js'

/** Cordis 插件名。 */
export const name = 'understand-you'

/** 依赖的 Host 服务：prompt 注册表。没有它插件保持不激活，而不是抛错。 */
export const inject = ['systemPrompt']

/**
 * 注册协议、可选的用户画像与每步提醒。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} [config] 来自 cordis.patch.yml 的行配置，容忍缺省与错误字段。
 */
export function apply(ctx, config) {
  const resolved = normalizeConfig(config)

  ctx.effect(() => ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: SECTION_ORDER,
    text: protocolText(resolved),
    // 文本里可能有用户配置的 extra，关掉变量插值以免 {{...}} 被当成模板。
    interpolate: false,
  }), 'understand-you.protocol')

  if (resolved.profile) {
    ctx.effect(() => ctx.systemPrompt.section({
      name: PROFILE_SECTION_NAME,
      order: PROFILE_SECTION_ORDER,
      text: profileText(resolved),
      interpolate: false,
    }), 'understand-you.profile')
  }

  if (resolved.reminder) {
    ctx.effect(() => ctx.systemPrompt.context({
      name: REMINDER_CONTEXT_NAME,
      order: REMINDER_ORDER,
      text: reminderText(resolved),
      interpolate: false,
    }), 'understand-you.reminder')
  }
}
