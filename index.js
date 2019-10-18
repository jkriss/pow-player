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

// TODO move this out to a default handler
const handleFile = function(evt) {
  console.log('file chosen:', evt)
  loadFile(evt.target.files[0])
}

const loadFile = async function(file) {
  fetch('/_/load', {
    method: 'POST',
    headers: {
      'Content-Type': 'image/png'
    },
    body: file 
  })
  .then(res => {
    if (res.status === 201) document.getElementById('frame').src = '/index.html'
    else console.error(`Expected status 201, got ${res.status}`)
  })
  .catch(console.error)
}

document.getElementById('file').addEventListener('change', handleFile)

