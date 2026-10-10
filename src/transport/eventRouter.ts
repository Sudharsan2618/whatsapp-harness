import {
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isJidStatusBroadcast,
  jidNormalizedUser,
  type WAMessage,
} from '@whiskeysockets/baileys'

export interface NormalizedInbound {
  chatJid: string
  customerJid: string
  text: string
}

function extractText(message: WAMessage): string | null {
  const content = message.message?.ephemeralMessage?.message ?? message.message
  const text =
    content?.conversation ??
    content?.extendedTextMessage?.text ??
    content?.imageMessage?.caption ??
    content?.videoMessage?.caption ??
    content?.documentMessage?.caption ??
    null
  if (text) return text
  // Media with no caption: give the agent a note so it can respond.
  if (content?.imageMessage) return '[customer sent an image]'
  if (content?.videoMessage) return '[customer sent a video]'
  if (content?.audioMessage) return '[customer sent a voice message]'
  if (content?.documentMessage) return '[customer sent a document]'
  if (content?.locationMessage) return '[customer shared a location]'
  return null
}

/**
 * Reduce a raw WAMessage to the fields the agent needs, or null to ignore it.
 * Skips own messages, broadcasts, newsletters, and non-text content. The
 * customer JID is normalized (device suffix stripped) and kept in whatever form
 * WhatsApp sent — LID or phone number.
 */
export function normalizeInbound(message: WAMessage): NormalizedInbound | null {
  if (message.key.fromMe) return null
  const remoteJid = message.key.remoteJid
  if (!remoteJid) return null
  if (isJidBroadcast(remoteJid) || isJidStatusBroadcast(remoteJid) || isJidNewsletter(remoteJid)) {
    return null
  }
  const text = extractText(message)
  if (!text) return null
  const sender = isJidGroup(remoteJid) ? (message.key.participant ?? remoteJid) : remoteJid
  return { chatJid: remoteJid, customerJid: jidNormalizedUser(sender), text }
}
