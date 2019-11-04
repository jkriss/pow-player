require('core-js/stable')
require('regenerator-runtime/runtime')
const { makeAnimatedQRCode } = require('./qr-export')
const html = require('nanohtml')

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', {scope: '/'})
  .then(function(reg) {
    console.log('Registration succeeded. Scope is ' + reg.scope);
    // need to reload to load this page with the service worker to get all our features
    if (!navigator.serviceWorker.controller) window.location.reload()
  }).catch(function(error) {
    console.log('Registration failed with ' + error);
  });
}

const handleFile = function(evt) {
  console.log('file chosen:', evt)
  loadFile(evt.target.files[0])
}

const loadFile = function(file) {
  window.file = file
  if (navigator.serviceWorker) {
    console.log("sending zip to service worker")
    var messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = function(event) {
      console.log('main page got message back', event.data)
      //if (event.data.type === 'zipLoaded') window.location.reload()
      if (event.data.type === 'zipLoaded') {
        document.getElementById('frame').src = '/zipindex.html'
      }
    }
    navigator.serviceWorker.controller.postMessage({
      type: 'zipFile',
      payload: file
    }, [messageChannel.port2])
  }

}

const showQRCode = async function() {
  // get the cached powfile
  const powfileBuffer = await fetch('/_/powfile.png').then(res => res.arrayBuffer())
   .catch(err => console.error('error fetching powfile', err))
  console.log("loaded powfile", powfileBuffer)
  const { canvasEl, destroy } = makeAnimatedQRCode(powfileBuffer)
  let el
  const close = (evt) => {
    evt.preventDefault()
    el.parentNode.removeChild(el)
    destroy()
  }
  el = html`
  <div id="modal">
    <a href="#" onclick=${close}>close</a>
    <div class="content">
      ${canvasEl}
    </div>
  </div>
  `  
  document.body.append(el)
}

document.getElementById('file').addEventListener('change', handleFile)
document.getElementById('back').addEventListener('click', function() {
  window.history.back()
})
document.getElementById('forward').addEventListener('click', function() {
  console.log("clicked forward")
  window.history.forward()
})
document.getElementById('export').addEventListener('click', function() {
  console.log("exporting file")
  showQRCode()
})

