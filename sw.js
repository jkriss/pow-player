require('core-js/stable')
require('regenerator-runtime/runtime')
const mime = require('mime/lite')
const { parse } = require('powfile')
const { parseResponse } = require('parse-raw-http').parseResponse

let zip
let zipLoading = false

self.addEventListener('message', async function(event){
  zipLoading = true
  //console.log("SW Received Message: ", event.data);
  // read in the file
  const reader = new FileReader()
  reader.readAsArrayBuffer(event.data.payload)
  reader.onload = async () => {
    const buf = new Buffer(reader.result)
    zip = await parse(buf, { unzip: true })
    console.log('new powfile loaded')
    zipLoading = false
    event.ports[0].postMessage({ type: 'zipLoaded' })
  }
  reader.onerror = () => console.error(reader.error)
})

const getFromZip = function(url) {
  const pathname = new URL(url).pathname.slice(1)
  let actualPath = pathname === '' ? '/' : pathname
  //console.log('getting', actualPath, 'from', zip)
  let fileEntry = zip.file(actualPath)
  if (!fileEntry && actualPath.match(/\/$/)) {
    actualPath = pathname+'index.html'
    fileEntry = zip.file(actualPath)
  }
  if (!fileEntry) return new Response('', { status: 404 })
  return fileEntry.async("nodebuffer").then(res => {
    try {
      const parsedResponse = parseResponse(res, {decodeContentEncoding:true})
      return new Response(parsedResponse.bodyData, { headers: parsedResponse.headers })
    } catch (err) {
      // not a valid http response, assume it's just a file
      const type = mime.getType(actualPath.match(/\.([^.]+)$/)[1])
      //console.log("sending file directly, type is", type)
      return new Response(res, { headers: {
        'Content-Length': res.length,
        'Content-Type': type 
      }})
    }
  })
}

const overrideUrl = function(urlString) {
  const url = new URL(urlString)
  if (self.location.origin === url.origin) {
    if (url.pathname.match(/^\/?$/)) return false
    if (url.pathname.match(/^\/budo\//)) return false
    if (url.pathname.match(/^\/sw.js/)) return false
    if (url.pathname.match(/\/_\//)) {
      console.log("skipping", url.pathname)
      return false
    }
    return true
  } else {
    return false
  }
}

self.addEventListener('fetch', function(event) {
  console.log('fetch event:', event)
  console.log('url:', event.request.url)
  console.log('zip exists?', zip)
  // TODO if zip hasn't loaded, wait for it
  const parsedUrl = new URL(event.request.url)
  if (parsedUrl.pathname === '/_/unload') {
    console.log("!! unloading !!")
    zip = null
    event.respondWith(new Response(null, { status: 302, headers: { Location: '/' }}))
  } else if (parsedUrl.pathname === '/zipindex.html') {
    // special url for the zip index
    event.respondWith(getFromZip(event.request.url.replace('/zipindex.html', '/index.html')))
  } else if (overrideUrl(event.request.url) && zip) {
    //event.respondWith(new Promise(resolve => resolve(new Response('hiiii '+event.request.url)))) 
    event.respondWith(getFromZip(event.request.url))
  } else {
    event.respondWith(fetch(event.request))
  }
})
