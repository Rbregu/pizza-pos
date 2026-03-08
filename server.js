// ─────────────────────────────────────────────────────────────
// PizzaPOS Backend Server
// AMI listener + WebSocket server for CTI integration
// ─────────────────────────────────────────────────────────────

import 'dotenv/config'
import { WebSocketServer } from 'ws'
import AsteriskManager from 'asterisk-manager'

const AMI_HOST     = process.env.AMI_HOST     || '127.0.0.1'
const AMI_PORT     = parseInt(process.env.AMI_PORT) || 5038
const AMI_USERNAME = process.env.AMI_USERNAME || 'pizzapos'
const AMI_SECRET   = process.env.AMI_SECRET   || 'pizza123'
const WS_PORT      = parseInt(process.env.WS_PORT) || 3001

// ─────────────────────────────────────────────
// Track active calls: linkedid → caller info
// So we don't broadcast the same call twice
// ─────────────────────────────────────────────
const activeCalls = new Map()

// ─────────────────────────────────────────────
// WebSocket Server
// ─────────────────────────────────────────────
const clients = new Set()
const wss = new WebSocketServer({ port: WS_PORT })

wss.on('listening', () => console.log(`✅ WebSocket server running on ws://localhost:${WS_PORT}`))
wss.on('connection', (ws) => {
  clients.add(ws)
  console.log(`📱 React app connected! (${clients.size} client(s))`)
  ws.send(JSON.stringify({ type: 'connected', message: 'PizzaPOS CTI ready' }))
  ws.on('close', () => { clients.delete(ws); console.log(`📱 Client disconnected (${clients.size} remaining)`) })
  ws.on('error', (err) => { clients.delete(ws); console.error('WS error:', err.message) })
})

function broadcast(data) {
  const message = JSON.stringify(data)
  let sent = 0
  clients.forEach(client => { if (client.readyState === 1) { client.send(message); sent++ } })
  console.log(`📡 Broadcasted to ${sent} client(s):`, JSON.stringify(data))
}

// ─────────────────────────────────────────────
// AMI Connection
// ─────────────────────────────────────────────
console.log(`🔌 Connecting to AMI at ${AMI_HOST}:${AMI_PORT} as "${AMI_USERNAME}"...`)
const ami = new AsteriskManager(AMI_PORT, AMI_HOST, AMI_USERNAME, AMI_SECRET, true)
ami.keepConnected()
ami.on('connect',    () => console.log('✅ AMI connected!'))
ami.on('error',      (e) => console.error('❌ AMI error:', e.message))
ami.on('disconnect', () => console.warn('⚠️  AMI disconnected, reconnecting...'))

// ─────────────────────────────────────────────
// AMI EVENT HANDLING
// ─────────────────────────────────────────────
ami.on('managerevent', (event) => {
  const eventName = event.event || ''

  // ── NEWSTATE: Ringing ──
  // This fires when the cashier's phone starts ringing.
  // At this point connectedlinenum = the real external caller.
  // linkedid ties both legs of the call together — we use it
  // to deduplicate so we only broadcast once per call.
  if (eventName === 'Newstate' && event.channelstatedesc === 'Up') {
    const linkedid    = event.linkedid || ''
    const callerNum   = (event.connectedlinenum  || '').replace(/\D/g, '')
    const callerName  = event.connectedlinename  || ''

    // Skip if we already broadcast this call, or no valid caller number
    if (!callerNum || callerNum === 'unknown' || callerNum.length < 4) return
    if (activeCalls.has(linkedid)) return

    // Store it so we can clean up on hangup and avoid duplicates
    activeCalls.set(linkedid, { phone: callerNum, callerName, linkedid })

    console.log(`\n📞 ANSWERED — Caller: ${callerNum} (${callerName}) → Cashier's phone is ringing`)

    const callsList = Array.from(activeCalls.values())

    broadcast({
      type:        'incoming_call',
      phone:       callerNum,
      callerName:  callerName !== '<unknown>' ? callerName : '',
      linkedid:    linkedid,
      activeCalls: callsList,
      timestamp:   new Date().toISOString(),
    })
  }

  // ── HANGUP ──
  // Clean up the call from active calls map.
  // Only clean up using the linkedid of the originating channel
  // (uniqueid === linkedid) to avoid duplicate cleanup.
  if (eventName === 'Hangup') {
    const linkedid = event.linkedid || ''
    const uniqueid = event.uniqueid || ''

    // Only process the hangup of the originating leg
    if (uniqueid === linkedid && activeCalls.has(linkedid)) {
      const callInfo = activeCalls.get(linkedid)
      activeCalls.delete(linkedid)

      console.log(`\n📵 CALL ENDED — ${callInfo.phone} (${activeCalls.size} call(s) remaining)`)

      broadcast({
        type:        'call_ended',
        phone:       callInfo.phone,
        linkedid:    linkedid,
        activeCalls: Array.from(activeCalls.values()),
        timestamp:   new Date().toISOString(),
      })
    }
  }
})

// ─────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...')
  ami.disconnect()
  wss.close()
  process.exit(0)
})

console.log('🍕 PizzaPOS CTI Server starting...')
console.log(`   AMI:       ${AMI_HOST}:${AMI_PORT}`)
console.log(`   WebSocket: ws://localhost:${WS_PORT}`)
console.log(`   Waiting for calls (triggers when cashier ANSWERS)...\n`)
