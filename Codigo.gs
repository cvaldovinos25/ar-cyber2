/**
 * RÉCORD DE JUGADORES · Caza relámpago de Salcotín
 *
 * Este script va dentro de una planilla de Google Sheets (Extensiones > Apps Script).
 * Guarda cada puntaje en la hoja "Puntajes" y lleva el récord de todos los jugadores.
 *
 * El juego lo llama así:
 *   .../exec?action=submit&score=23   guarda el puntaje y devuelve el récord
 *   .../exec?action=record            solo consulta el récord
 *
 * Respuesta: { ok: true, record: 25, previousRecord: 22 }
 * previousRecord es null si nadie había jugado antes.
 */

const SHEET_NAME = 'Puntajes'
// Puntaje máximo creíble en 30 segundos. Lo que venga por encima se rechaza,
// para que nadie pueda inventar un récord imposible escribiendo la URL a mano.
const MAX_SCORE = 50

function doGet(e) {
  const params = (e && e.parameter) || {}
  try {
    if (params.action === 'submit') return json(submitScore(params.score))
    return json({ ok: true, record: getRecord(), previousRecord: getRecord() })
  } catch (err) {
    return json({ ok: false, error: String(err) })
  }
}

function submitScore(rawScore) {
  const score = Number(rawScore)
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    return { ok: false, error: 'Puntaje no válido' }
  }

  // evita que dos jugadores que terminan al mismo tiempo se pisen el récord
  const lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    const previousRecord = getRecord()
    getSheet().appendRow([new Date(), score])
    const record = previousRecord === null ? score : Math.max(previousRecord, score)
    PropertiesService.getScriptProperties().setProperty('record', String(record))
    return { ok: true, record: record, previousRecord: previousRecord }
  } finally {
    lock.releaseLock()
  }
}

// récord actual (null si todavía no juega nadie)
function getRecord() {
  const saved = PropertiesService.getScriptProperties().getProperty('record')
  return saved === null ? null : Number(saved)
}

function getSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = book.getSheetByName(SHEET_NAME)
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME)
    sheet.appendRow(['Fecha', 'Puntaje'])
    sheet.setFrozenRows(1)
  }
  return sheet
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}

/**
 * Para reiniciar el récord (por ejemplo, al empezar una campaña nueva):
 * selecciona esta función arriba y presiona "Ejecutar".
 * No borra la hoja de puntajes, solo pone el récord en cero.
 */
function reiniciarRecord() {
  PropertiesService.getScriptProperties().deleteProperty('record')
}
