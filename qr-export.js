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

const makeFrames = (powfileBuffer, opts={}) => {
  // always encode as an http response
  const buf = makeResponse(powfileBuffer)
  const packetSize = opts.packetSize || 250
  const loops = opts.loops || 3 
  return dataToFrames(buf, packetSize, loops)
}

const makeAnimatedQRCode = (powfileBuffer, opts={}) => {
  const frames = makeFrames(powfileBuffer)
  return makeAnimatedQRCodeFromFrames(frames, opts)
}

const makeAnimatedQRCodeFromFrames = (frames, opts={}) => {
  const canvasEl = document.createElement('canvas')
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
  makeAnimatedQRCode,
  makeAnimatedQRCodeFromFrames,
  makeFrames
}
