#!/usr/bin/env node
/**
 * The pinned seed prompt in Discord #start-here always equals the README.
 * Runs on every push that touches README.md: extracts the prompt from between
 * the code fences and edits the bot's pinned message in place - same message
 * id, so the pin never moves and old links to it never break. If the content
 * already matches, Discord treats the edit as a no-op.
 */
import { readFileSync } from 'node:fs'

const CHANNEL = '1527630662784389241'   // #start-here
// fence order in README.md -> pinned bot message, both edited in place
const PINS = [
  { fence: 0, message: '1528029293224005632', header: '**new board** copy all of this:' },
  { fence: 1, message: '1528340748737708062', header: '**update your board** any board, any state. copy all of this:' },
]
const T = process.env.DISCORD_BOT_TOKEN
if (!T) { console.error('missing DISCORD_BOT_TOKEN'); process.exit(1) }

const md = readFileSync('README.md', 'utf8')
const fences = [...md.matchAll(/```\n([\s\S]*?)```/g)].map(m => m[1])

let failed = 0
for (const pin of PINS) {
  const body = fences[pin.fence]
  if (body == null) { console.error(`fence ${pin.fence} missing from README.md`); failed++; continue }
  const content = pin.header + '\n```\n' + body + '```'
  if (content.length > 2000) { console.error(`fence ${pin.fence} too long: ${content.length}`); failed++; continue }
  const r = await fetch(`https://discord.com/api/v10/channels/${CHANNEL}/messages/${pin.message}`, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bot ' + T,
      'Content-Type': 'application/json',
      'User-Agent': 'DiscordBot (https://github.com/rowanthistlebrooke, 1.0)',
    },
    body: JSON.stringify({ content }),
  })
  console.log(r.ok ? `fence ${pin.fence} → pinned message synced ✓` : `fence ${pin.fence} sync failed: ${r.status}`)
  if (!r.ok) failed++
}
process.exit(failed ? 1 : 0)
