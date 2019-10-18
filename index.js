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

document.getElementById('file').addEventListener('change', handleFile)

