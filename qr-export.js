const { dataToFrames } = require('qrloop/exporter')
const qrcode = require('qrcode')
const LF = '\r\n'
const delay = 130

const makeResponse = (powfileBuffer) => {
  const lines = [
    'HTTP/1.1 200 OK',
    `Content-Length: ${powfileBuffer.length}`,
    'Content-Type: image/png'
  ] 
  return Buffer.concat([Buffer.from(lines.join(LF)), Buffer.from(powfileBuffer)])
}

const makeFrames = (powfileBuffer) => {
  // always encode as an http response
  const buf = makeResponse(powfileBuffer)
  const packetSize = 250
  const loops = 5 
  return dataToFrames(buf, packetSize, loops)
}

const makeAnimatedQRCode = (powfileBuffer, opts={}) => {
  console.log(`making animated qr code from`, powfileBuffer)
  const canvasEl = document.createElement('canvas')
  const frames = makeFrames(powfileBuffer)
  console.log(`created ${frames.length} frames`)
  let i = 0
  const update = () => {
    if (i === frames.length) i = 0
    qrcode.toCanvas(canvasEl, frames[i], { width: opts.width || 300 })
    i++
  }
  // TODO use requestAnimationFrame
  const updateInterval = setInterval(update, delay)  
  const destroy = () => {
    console.log("-- stopping animation --")
    clearInterval(updateInterval)
  }
  return { 
    canvasEl,
    destroy 
  }
}

module.exports = {
  makeAnimatedQRCode
}
