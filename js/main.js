// ============================================================
// CAZA RELÁMPAGO DE SALCOTÍN (sin motores externos)
//
// La persona tiene 30 segundos. Los Salcotines (1.png) aparecen a su
// alrededor solo un momento y se esconden: hay que girar el celular y
// tocar todos los que se pueda. Cada 3 seguidos hay combo (punto extra).
// Al final, si llega a la meta, gana el premio (2.png).
//
// Usa solo lo que trae el navegador (cámara + sensores de giro) y
// three.js alojado en este mismo repositorio.
// En computador se mira alrededor arrastrando con el mouse.
// ============================================================

// ---------- Ajustes del juego ----------
const CONFIG = {
  GAME_SECONDS: 30,          // duración de la partida
  GOAL: 15,                  // puntaje para ganar el premio

  // Aparición de Salcotines (los valores van del inicio al final de la partida:
  // el juego se pone más rápido a medida que pasa el tiempo)
  SPAWN_INTERVAL_MS: [1200, 750],   // cada cuánto aparece uno nuevo
  LIFETIME_MS: [2400, 1500],        // cuánto se queda antes de esconderse (lo que más cambia la dificultad)
  MAX_ACTIVE: 3,                    // máximo de Salcotines a la vez

  // Dónde aparecen
  IN_VIEW_CHANCE: 0.3,       // probabilidad de que aparezca dentro de la pantalla
  IN_VIEW_DEG: 16,           // "dentro de la pantalla" = a menos de esto del centro
  SPAWN_SPREAD_DEG: 165,     // el resto aparece hasta esto a cada lado (hay que girar)
  MIN_SEPARATION_DEG: 25,    // para que no aparezcan encimados
  DISTANCE_RANGE: [2.4, 3.4],// metros
  HEIGHT_RANGE: [-0.7, 0.3], // metros respecto a los ojos

  PLANE_HEIGHT: 1.15,        // alto de cada Salcotín (m); el ancho se calcula solo

  COMBO_EVERY: 3,            // cada cuántos seguidos hay combo
  COMBO_BONUS: 1,            // puntos extra por combo
  TAP_TOLERANCE_PX: 26,      // un toque cerca de un Salcotín también cuenta

  CAMERA_FOV: 60,
  SMOOTHING: 0.35,           // 0 a 1: más bajo = movimiento más suave
  HURRY_SECONDS: 5,          // el reloj se pone rojo en los últimos segundos
}

const ASSETS = {
  salcotin: 'assets/1.png',
  confetti: ['assets/amarillo.png', 'assets/celeste.png', 'assets/rosa.png'],
}

// Premios según el puntaje (del más alto al más bajo). Puedes agregar más niveles,
// por ejemplo { minScore: 25, image: 'assets/3.png', message: '...' } antes del actual.
const PRIZES = [
  { minScore: CONFIG.GOAL, image: 'assets/2.png', message: '¡Toma un pantallazo y canjea tu premio!' },
]

const TEXTS = {
  go: '¡Ya!',
  timeUp: '¡Tiempo!',
  combo: (n) => `¡Combo x${n}!`,
  kickerWin: '¡Lo lograste!',
  kickerLose: '¡Se acabó el tiempo!',
  noPrize: (missing) => `¡Casi! Te faltaron ${missing} para ganar el premio.`,
  record: (n) => `Tu récord: ${n}`,
  newRecord: '¡Nuevo récord!',
}

const RECORD_KEY = 'salcotin-caza-record'

const randRange = (min, max) => Math.random() * (max - min) + min
const toRad = (deg) => (deg * Math.PI) / 180
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const $ = (id) => document.getElementById(id)

// ---------- Estado general ----------
let renderer, scene, camera
let textures = {}
let pool = []                 // Salcotines reutilizables
let state = 'idle'            // idle | countdown | playing | over
let score = 0
let combo = 0
let gameStart = 0
let nextSpawnAt = 0
let dragMode = false
let started = false

// ============================================================
// 1. Orientación del celular -> rotación de la cámara 3D
// ============================================================
const orientation = { alpha: null, beta: 0, gamma: 0 }
const targetQuat = new THREE.Quaternion()
const zAxis = new THREE.Vector3(0, 0, 1)
const tmpEuler = new THREE.Euler()
const tmpQuat = new THREE.Quaternion()
const toFront = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))

function onDeviceOrientation(event) {
  if (event.alpha === null) return
  orientation.alpha = event.alpha
  orientation.beta = event.beta
  orientation.gamma = event.gamma
}

function screenAngle() {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle
  return window.orientation || 0
}

function updateTargetFromSensors() {
  tmpEuler.set(toRad(orientation.beta), toRad(orientation.alpha), -toRad(orientation.gamma), 'YXZ')
  targetQuat.setFromEuler(tmpEuler)
  targetQuat.multiply(toFront)
  targetQuat.multiply(tmpQuat.setFromAxisAngle(zAxis, -toRad(screenAngle())))
}

let yaw = 0
let pitch = 0
function updateTargetFromDrag() {
  tmpEuler.set(pitch, yaw, 0, 'YXZ')
  targetQuat.setFromEuler(tmpEuler)
}

function forwardAngle() {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
  return Math.atan2(f.x, f.z)
}

// ============================================================
// 2. Permisos, cámara e imágenes
// ============================================================
async function requestMotionPermission() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    const result = await DeviceOrientationEvent.requestPermission()
    if (result !== 'granted') throw new Error('MOTION_DENIED')
  }
  window.addEventListener('deviceorientation', onDeviceOrientation)
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('NO_CAMERA_API')
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  })
  const video = $('camera-feed')
  video.srcObject = stream
  await video.play()
}

function loadTexture(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, (tex) => {
      tex.encoding = THREE.sRGBEncoding
      tex.anisotropy = 4
      resolve(tex)
    }, undefined, () => reject(new Error('No se pudo cargar ' + url)))
  })
}

async function loadAllTextures() {
  const loader = new THREE.TextureLoader()
  const [salcotin, ...confetti] = await Promise.all([
    loadTexture(loader, ASSETS.salcotin),
    ...ASSETS.confetti.map((u) => loadTexture(loader, u)),
  ])
  textures = { salcotin, confetti }
}

function friendlyError(error) {
  const name = error && (error.name || error.message)
  if (!window.isSecureContext) return 'La página tiene que abrirse con https:// para poder usar la cámara.'
  if (name === 'MOTION_DENIED') return 'Se negó el permiso de movimiento. Cierra esta pestaña, vuelve a abrir el link y acepta el permiso.'
  if (name === 'NO_CAMERA_API') return 'Este navegador no permite usar la cámara. Abre el link en Safari (iPhone) o Chrome (Android), no dentro de Instagram o WhatsApp.'
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Se negó el permiso de cámara. Actívalo en los ajustes del navegador para este sitio y recarga la página.'
  if (name === 'NotReadableError') return 'La cámara está siendo usada por otra app. Ciérrala y recarga la página.'
  return 'Ocurrió un error inesperado: ' + (error && error.message ? error.message : name)
}

function showError(error) {
  console.error(error)
  $('loading-screen').classList.add('hidden')
  $('start-screen').classList.add('hidden')
  $('error-message').textContent = friendlyError(error)
  $('error-screen').classList.remove('hidden')
}

// ============================================================
// 3. Escena y Salcotines
// ============================================================
function setupScene() {
  renderer = new THREE.WebGLRenderer({ canvas: $('scene'), alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setClearColor(0x000000, 0)
  renderer.outputEncoding = THREE.sRGBEncoding

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(CONFIG.CAMERA_FOV, window.innerWidth / window.innerHeight, 0.05, 100)

  // un plano compartido por todos los Salcotines, con el ancho según la imagen
  const img = textures.salcotin.image
  const h = CONFIG.PLANE_HEIGHT
  const geom = new THREE.PlaneGeometry(h * (img.width / img.height), h)
  for (let i = 0; i < CONFIG.MAX_ACTIVE + 2; i++) {
    const mesh = new THREE.Mesh(
      geom,
      new THREE.MeshBasicMaterial({ map: textures.salcotin, transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.02 })
    )
    mesh.visible = false
    mesh.userData = { active: false }
    scene.add(mesh)
    pool.push(mesh)
  }

  window.addEventListener('resize', onResize)
  window.addEventListener('orientationchange', () => setTimeout(onResize, 200))
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

function activeSalcotines() {
  return pool.filter((m) => m.userData.active)
}

// qué tan avanzada va la partida (0 al inicio, 1 al final)
function progress(now) {
  return clamp((now - gameStart) / (CONFIG.GAME_SECONDS * 1000), 0, 1)
}

function spawnSalcotin(now) {
  const mesh = pool.find((m) => !m.userData.active)
  if (!mesh) return

  const front = forwardAngle()
  const used = activeSalcotines().map((m) => Math.atan2(m.position.x, m.position.z))
  let angle
  for (let tries = 0; tries < 12; tries++) {
    if (Math.random() < CONFIG.IN_VIEW_CHANCE) {
      angle = front + toRad(randRange(-CONFIG.IN_VIEW_DEG, CONFIG.IN_VIEW_DEG))
    } else {
      const side = Math.random() < 0.5 ? -1 : 1
      angle = front + side * toRad(randRange(CONFIG.IN_VIEW_DEG + 10, CONFIG.SPAWN_SPREAD_DEG))
    }
    if (used.every((u) => Math.abs(wrapAngle(u - angle)) > toRad(CONFIG.MIN_SEPARATION_DEG))) break
  }

  const dist = randRange(CONFIG.DISTANCE_RANGE[0], CONFIG.DISTANCE_RANGE[1])
  const y = randRange(CONFIG.HEIGHT_RANGE[0], CONFIG.HEIGHT_RANGE[1])
  mesh.position.set(Math.sin(angle) * dist, y, Math.cos(angle) * dist)

  const p = progress(now)
  Object.assign(mesh.userData, {
    active: true,
    phase: 'in',              // in -> idle -> out (escapa) | caught (atrapado)
    born: now,
    life: lerp(CONFIG.LIFETIME_MS[0], CONFIG.LIFETIME_MS[1], p),
    baseY: y,
    endAt: 0,
    wobble: Math.random() * 10,
  })
  mesh.visible = true
  mesh.scale.setScalar(0.001)
}

const easeOutBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2)

// anima cada Salcotín según su fase
function updateSalcotines(now) {
  for (const m of pool) {
    const u = m.userData
    if (!u.active) continue
    const age = now - u.born
    m.lookAt(camera.position.x, m.position.y, camera.position.z)

    if (u.phase === 'caught') {
      // salta, gira y desaparece
      const t = clamp((now - u.endAt) / 260, 0, 1)
      m.scale.setScalar(Math.max((1 + 0.35 * Math.sin(Math.PI * t)) * (1 - t), 0.001))
      m.rotateZ(t * Math.PI * 1.5)
      if (t >= 1) release(m)
      continue
    }

    if (u.phase === 'in') {
      // aparece de golpe con rebote, subiendo un poco
      const t = clamp(age / 220, 0, 1)
      m.scale.setScalar(Math.max(easeOutBack(t), 0.001))
      m.position.y = u.baseY - 0.25 * (1 - t)
      if (t >= 1) u.phase = 'idle'
      continue
    }

    if (u.phase === 'idle') {
      // se balancea mientras espera, como burlándose
      const wiggle = Math.sin((now / 1000) * 9 + u.wobble)
      m.scale.set(1 + 0.04 * wiggle, 1 - 0.04 * wiggle, 1)
      m.rotateZ(0.08 * Math.sin((now / 1000) * 6 + u.wobble))
      m.position.y = u.baseY
      if (age >= u.life) {
        u.phase = 'out'
        u.endAt = now
      }
      continue
    }

    if (u.phase === 'out') {
      // se esconde hundiéndose: se escapó
      const t = clamp((now - u.endAt) / 220, 0, 1)
      m.scale.set(Math.max(1 + 0.2 * t, 0.001), Math.max(1 - t, 0.001), 1)
      m.position.y = u.baseY - 0.35 * t
      if (t >= 1) {
        release(m)
        if (state === 'playing') combo = 0   // se rompe el combo
      }
    }
  }
}

function release(mesh) {
  mesh.userData.active = false
  mesh.visible = false
}

// ============================================================
// 4. Confeti
// ============================================================
function createConfettiBurst(texture, position, gravity, count) {
  const sprites = []
  const img = texture.image
  const aspect = img.width / img.height
  for (let i = 0; i < count; i++) {
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
    material.rotation = Math.random() * Math.PI * 2
    const sprite = new THREE.Sprite(material)
    const size = randRange(0.05, 0.09)
    sprite.scale.set(size * aspect, size, 1)
    sprite.position.copy(position)
    const dir = new THREE.Vector3(randRange(-1, 1), randRange(-0.3, 1), randRange(-1, 1)).normalize()
    sprite.userData.v = dir.multiplyScalar(randRange(1, 2)).add(new THREE.Vector3(0, 1, 0))
    sprite.userData.spin = randRange(-6, 6)
    scene.add(sprite)
    sprites.push(sprite)
  }
  const start = performance.now()
  let last = start
  const duration = 1100
  function step(now) {
    const t = (now - start) / duration
    const dt = (now - last) / 1000
    last = now
    if (t >= 1) { sprites.forEach((s) => { scene.remove(s); s.material.dispose() }); return }
    for (const s of sprites) {
      s.userData.v.y -= gravity * 9.8 * dt
      s.position.addScaledVector(s.userData.v, dt)
      s.material.rotation += s.userData.spin * dt
      s.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
    }
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function confettiAt(position, big) {
  const gravities = [0.6, 0.5, 0.2]
  textures.confetti.forEach((tex, i) => createConfettiBurst(tex, position, gravities[i] || 0.4, big ? 30 : 10))
}

// ============================================================
// 5. Atrapar
// ============================================================
function screenPos(mesh) {
  const p = mesh.position.clone().project(camera)
  const behind = new THREE.Vector3().copy(mesh.position).applyMatrix4(camera.matrixWorldInverse).z > 0
  return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight, behind }
}

function catchSalcotin(mesh) {
  const u = mesh.userData
  if (!u.active || u.phase === 'caught' || u.phase === 'out') return
  u.phase = 'caught'
  u.endAt = performance.now()

  combo += 1
  let gained = 1
  const isCombo = combo % CONFIG.COMBO_EVERY === 0
  if (isCombo) gained += CONFIG.COMBO_BONUS
  score += gained

  const pos = screenPos(mesh)
  spawnFloater(isCombo ? `+${gained}` : '+1', pos.x, pos.y)
  if (isCombo) showCenterText(TEXTS.combo(combo), true, 750)
  confettiAt(mesh.position.clone(), isCombo)
  updateHud()
  bumpScore()
  if (navigator.vibrate) navigator.vibrate(isCombo ? [40, 40, 60] : 35)
}

const tapRay = new THREE.Raycaster()
const tapNdc = new THREE.Vector2()

function tryTap(clientX, clientY) {
  if (state !== 'playing') return
  tapNdc.x = (clientX / window.innerWidth) * 2 - 1
  tapNdc.y = -(clientY / window.innerHeight) * 2 + 1
  tapRay.setFromCamera(tapNdc, camera)
  const targets = activeSalcotines().filter((m) => m.userData.phase === 'in' || m.userData.phase === 'idle')
  const hits = tapRay.intersectObjects(targets, false)
  if (hits.length) return catchSalcotin(hits[0].object)

  // tolerancia para dedos: el más cercano al toque, si está a pocos píxeles
  let best = null
  let bestD = CONFIG.TAP_TOLERANCE_PX
  for (const m of targets) {
    const p = screenPos(m)
    if (p.behind) continue
    const d = Math.hypot(p.x - clientX, p.y - clientY)
    if (d <= bestD) { best = m; bestD = d }
  }
  if (best) catchSalcotin(best)
}

let pointerStart = null
function setupInput() {
  const canvas = $('scene')
  canvas.addEventListener('pointerdown', (e) => {
    pointerStart = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY }
    // en celular se atrapa al apoyar el dedo: más rápido y más justo
    if (!dragMode) tryTap(e.clientX, e.clientY)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!pointerStart || !dragMode) return
    yaw += (e.clientX - pointerStart.lastX) * 0.005
    pitch = clamp(pitch + (e.clientY - pointerStart.lastY) * 0.005, -1.3, 1.3)
    pointerStart.lastX = e.clientX
    pointerStart.lastY = e.clientY
  })
  canvas.addEventListener('pointerup', (e) => {
    if (!pointerStart) return
    const moved = Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y)
    pointerStart = null
    if (dragMode && moved < 12) tryTap(e.clientX, e.clientY)
  })
  canvas.addEventListener('pointercancel', () => { pointerStart = null })
}

// ============================================================
// 6. Marcador, textos y flechas
// ============================================================
function updateHud(now) {
  $('score').textContent = score
  if (now === undefined) return
  const remaining = state === 'playing'
    ? Math.max(0, CONFIG.GAME_SECONDS - (now - gameStart) / 1000)
    : CONFIG.GAME_SECONDS
  $('time').textContent = Math.ceil(remaining)
  $('time-bar-fill').style.transform = `scaleX(${remaining / CONFIG.GAME_SECONDS})`
  $('time-pill').classList.toggle('hurry', state === 'playing' && remaining <= CONFIG.HURRY_SECONDS)
}

function bumpScore() {
  const pill = $('score-pill')
  pill.classList.remove('bump')
  void pill.offsetWidth // reinicia la animación
  pill.classList.add('bump')
}

function spawnFloater(text, x, y) {
  const el = document.createElement('div')
  el.className = 'floater'
  el.textContent = text
  el.style.left = clamp(x, 40, window.innerWidth - 40) + 'px'
  el.style.top = clamp(y, 120, window.innerHeight - 60) + 'px'
  $('floaters').appendChild(el)
  setTimeout(() => el.remove(), 950)
}

let centerTimer = null
function showCenterText(text, small, ms) {
  const el = $('center-text')
  clearTimeout(centerTimer)
  el.textContent = text
  el.classList.toggle('small', !!small)
  el.classList.remove('hidden', 'pop')
  void el.offsetWidth
  el.classList.add('pop')
  if (ms) centerTimer = setTimeout(() => el.classList.add('hidden'), ms)
}

// flechas en el borde de la pantalla hacia los Salcotines que no se ven
const ARROW_SVG = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="rgba(251,3,251,0.85)"/><path d="M14 11 L29 20 L14 29 Z" fill="#fff"/></svg>'
const arrowEls = []
const tmpVec = new THREE.Vector3()

function updateArrows() {
  const container = $('arrows')
  const list = state === 'playing'
    ? activeSalcotines().filter((m) => m.userData.phase === 'in' || m.userData.phase === 'idle')
    : []
  while (arrowEls.length < list.length) {
    const el = document.createElement('div')
    el.className = 'edge-arrow'
    el.innerHTML = ARROW_SVG
    container.appendChild(el)
    arrowEls.push(el)
  }
  const w = window.innerWidth
  const h = window.innerHeight
  arrowEls.forEach((el, i) => {
    const m = list[i]
    if (!m) { el.style.display = 'none'; return }
    tmpVec.copy(m.position).applyMatrix4(camera.matrixWorldInverse)
    const ndc = m.position.clone().project(camera)
    const onScreen = tmpVec.z < 0 && Math.abs(ndc.x) < 0.95 && Math.abs(ndc.y) < 0.95
    if (onScreen) { el.style.display = 'none'; return }
    let dx = tmpVec.x
    let dy = -tmpVec.y
    if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) dx = 1
    const angle = Math.atan2(dy, dx)
    // sobre una elipse pegada a los bordes, sin tapar el marcador de arriba
    const x = w / 2 + Math.cos(angle) * (w / 2 - 34) - 23
    const y = clamp(h / 2 + Math.sin(angle) * (h / 2 - 60) - 23, 110, h - 80)
    el.style.display = 'block'
    el.style.transform = `translate(${x}px, ${y}px) rotate(${angle}rad)`
  })
}

// ============================================================
// 7. Flujo de la partida
// ============================================================
function startCountdown() {
  state = 'countdown'
  score = 0
  combo = 0
  pool.forEach(release)
  updateHud(performance.now())
  $('results-screen').classList.add('hidden')
  $('hud').classList.remove('hidden')

  const steps = ['3', '2', '1', TEXTS.go]
  steps.forEach((txt, i) => {
    setTimeout(() => {
      showCenterText(txt, false, i === steps.length - 1 ? 600 : 0)
      if (i === steps.length - 1) startGame()
    }, i * 750)
  })
}

function startGame() {
  state = 'playing'
  gameStart = performance.now()
  nextSpawnAt = gameStart
}

function endGame() {
  state = 'over'
  showCenterText(TEXTS.timeUp, false, 1100)
  // los que quedan se esconden
  activeSalcotines().forEach((m) => {
    if (m.userData.phase !== 'caught') { m.userData.phase = 'out'; m.userData.endAt = performance.now() }
  })
  setTimeout(showResults, 1300)
}

function readRecord() {
  try { return parseInt(localStorage.getItem(RECORD_KEY) || '0', 10) || 0 } catch (e) { return 0 }
}

function saveRecord(n) {
  try { localStorage.setItem(RECORD_KEY, String(n)) } catch (e) { /* sin almacenamiento: no pasa nada */ }
}

function showResults() {
  const prize = PRIZES.find((p) => score >= p.minScore)
  const previous = readRecord()
  const isRecord = score > previous
  if (isRecord) saveRecord(score)

  $('result-score').textContent = score
  $('result-kicker').textContent = prize ? TEXTS.kickerWin : TEXTS.kickerLose
  $('result-record').textContent = isRecord && previous > 0 ? TEXTS.newRecord : TEXTS.record(Math.max(score, previous))

  const img = $('result-prize')
  if (prize) {
    img.src = prize.image
    img.classList.remove('hidden')
    $('result-message').textContent = prize.message
  } else {
    img.classList.add('hidden')
    const lowest = Math.min(...PRIZES.map((p) => p.minScore))
    $('result-message').textContent = TEXTS.noPrize(lowest - score)
  }

  $('hud').classList.add('hidden')
  $('results-screen').classList.remove('hidden')
}

// ============================================================
// 8. Bucle de dibujo
// ============================================================
function loop(now) {
  if (dragMode) updateTargetFromDrag()
  else if (orientation.alpha !== null) updateTargetFromSensors()
  camera.quaternion.slerp(targetQuat, CONFIG.SMOOTHING)
  camera.updateMatrixWorld()

  if (state === 'playing') {
    if (now - gameStart >= CONFIG.GAME_SECONDS * 1000) {
      endGame()
    } else if (now >= nextSpawnAt && activeSalcotines().length < CONFIG.MAX_ACTIVE) {
      spawnSalcotin(now)
      nextSpawnAt = now + lerp(CONFIG.SPAWN_INTERVAL_MS[0], CONFIG.SPAWN_INTERVAL_MS[1], progress(now))
    }
    updateHud(now)
  }

  updateSalcotines(now)
  updateArrows()
  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}

// ============================================================
// 9. Arranque
// ============================================================
async function launchExperience() {
  if (started) return
  started = true
  $('start-screen').classList.add('hidden')
  $('loading-screen').classList.remove('hidden')

  try {
    await requestMotionPermission() // primero, mientras el toque sigue vigente en iOS
  } catch (error) {
    showError(error)
    return
  }

  try {
    await Promise.all([
      startCamera().catch((error) => {
        if (error && (error.name === 'NotFoundError' || error.name === 'OverconstrainedError')) {
          console.warn('Sin cámara disponible, sigo sin video de fondo.')
          return
        }
        throw error
      }),
      loadAllTextures(),
    ])
  } catch (error) {
    showError(error)
    return
  }

  setupScene()
  setupInput()
  requestAnimationFrame(loop)

  // esperar los primeros datos de los sensores
  setTimeout(() => {
    if (orientation.alpha === null) dragMode = true
    if (dragMode) updateTargetFromDrag()
    else updateTargetFromSensors()
    camera.quaternion.copy(targetQuat)
    camera.updateMatrixWorld()
    $('loading-screen').classList.add('hidden')
    startCountdown()
  }, 900)
}

$('rules-seconds').textContent = CONFIG.GAME_SECONDS
$('rules-goal').textContent = Math.min(...PRIZES.map((p) => p.minScore))
$('start-button').addEventListener('click', launchExperience)
