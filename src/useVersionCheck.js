// __APP_VERSION__ is injected by vite.config.js define at build time
/* eslint-disable no-undef */
const CURRENT = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

let _onUpdate = null
let _lastCheck = 0
const MIN_INTERVAL = 5 * 60 * 1000 // 5분

export function initVersionCheck(onUpdate) {
  _onUpdate = onUpdate
}

export async function checkVersion() {
  if (import.meta.env.DEV || CURRENT === 'dev' || !_onUpdate) return
  const now = Date.now()
  if (now - _lastCheck < MIN_INTERVAL) return
  _lastCheck = now
  try {
    const res = await fetch('/version.json?t=' + now)
    if (!res.ok) return
    const { v } = await res.json()
    if (v !== CURRENT) _onUpdate()
  } catch {
    // 네트워크 오류 무시
  }
}
