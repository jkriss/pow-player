require('core-js/stable')
require('regenerator-runtime/runtime')
const mime = require('mime/lite')
const { parse } = require('powfile')
const { parseResponse } = require('parse-raw-http').parseResponse
const version = 'v1'

self.addEventListener("install", function(event) {
  console.log("installed, skip waiting");
  // prime cache so it works offline next time
  event.waitUntil(
    openCache().then(function(cache) {
      console.log("-- initializing cache --")
      return cache.addAll([
        '/',
        '/_/bundle.js',
        '/_/about-pow.png'
      ]).catch(console.error)
      .then(() => console.log("-- cache initialized --"))
    })
  )
  // install immediately
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log("-- activating --")
  return self.clients.claim();
});

let cachePromise;
function openCache() {
  if (!cachePromise) { cachePromise = caches.open(version); }
  return cachePromise;
}

let zip
let zipLoading = false

const loadZip = function(payload, port) {
  console.log("loading zip from", payload)
  return new Promise((resolve, reject) => {
  zip = null
  zipLoading = true
  // read in the file
  const reader = new FileReader()
  reader.readAsArrayBuffer(payload)
  reader.onload = async () => {
    const buf = new Buffer(reader.result)
    try {
      zip = await parse(buf, { unzip: true })
      console.log('new powfile loaded')
    } catch (err) {
      console.error("Couldn't load powfile:", err)
    }
    zipLoading = false,
    openCache().then(cache => {
      const req = new Request(self.location.origin + '/_/powfile.png')
      console.log("caching powfile as", req)
      cache.put(
        req,
        new Response(buf, { headers: { 'Content-Type': 'image/png', 'Content-Length': buf.length, 'Content-Disposition': 'attachment; filename=powfile.png' } })
      )
    })
    if (port) port.postMessage({ type: 'zipLoaded' })
    resolve()
  }
  reader.onerror = () => reject(reader.error)
  })
}

self.addEventListener('message', async function(event){
  loadZip(event.data.payload, event.ports[0])
})

const loadZipFallback = async () => {
  if (!zip) {
    // try to grab it from the cache first
    await openCache()
    .then(cache => cache.match(new Request(self.location.origin+'/_/powfile.png')))
    .then(res => {
      if (!res) throw "no response for powfile.png"
      return res
    })
    .then(res => res.blob().then(blob => loadZip(blob)))
    .catch(err => console.error("error loading zip from cache:", err))
  }
  //if (!zip) return new Response("This file isn't a powfile, no data found.", { status: 404 })
  if (!zip) await openCache()
    .then(cache => cache.match(new Request(self.location.origin+'/_/about-pow.png')))
    .then(res => res.blob()).then(blob => loadZip(blob))
    .catch(err => console.error("error loading about powfile", err)) 
}

const getFromZip = async function(url) {
  await loadZipFallback()
  const pathname = new URL(url).pathname.slice(1)
  let actualPath = pathname === '' ? '/' : pathname
  //console.log('getting', actualPath, 'from', zip)
  let fileEntry = zip.file(actualPath)
  if (!fileEntry && actualPath.match(/\/$/)) {
    actualPath = pathname+'index.html'
    fileEntry = zip.file(actualPath)
  }
  if (!fileEntry) {
    console.log("no file found for", actualPath)
    return new Response('', { status: 404 })
  }
  return fileEntry.async("nodebuffer").then(res => {
    try {
      const parsedResponse = parseResponse(res, {decodeContentEncoding:true})
      console.log("parsed response:", parsedResponse)
      //return new Response(parsedResponse.bodyData, { headers: parsedResponse.headers })
      // const newRes = new Response(parsedResponse.bodyData, { headers: parsedResponse.headers })
      const headers = parsedResponse.headers
      // download image files by default
      if (headers['content-type'].includes('image')) {
        headers['Content-Disposition'] = `attachment; filename=${pathname.split('/').pop()}`
      }
      const newRes = new Response(parsedResponse.bodyData, { headers })
      console.log("returning response from zip:", newRes)
      return newRes
    } catch (err) {
      console.error("error parsing http response:", err)
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
    const req = new Request(self.location.origin + '/_/powfile.png')
    event.respondWith(
      openCache()
        .then(cache => cache.delete(req))
        // safari doesn't like getting a 302 back for some reason
        //.then(() => new Response(null, { status: 302, headers: { Location: '/' }}))
        .then(() => new Response(null, { status: 200 }))
    )
  } else if (parsedUrl.pathname === '/zipindex.html') {
    // special url for the zip index
    event.respondWith(getFromZip(event.request.url.replace('/zipindex.html', '/index.html')))
  } else if (overrideUrl(event.request.url)) {
    event.respondWith(getFromZip(event.request.url))
  } else if (parsedUrl.pathname === '/_/powfile.png') {
    event.respondWith(caches.match(event.request))
  } else {
    // these are regular fetches, but use the cache if we need to
    //event.respondWith(fetch(event.request))
    console.log("handling request:", event.request)
    event.respondWith(
      caches.match(event.request).then(resp => {
        console.log("cache match for", event.request, "?", resp)
        if (resp && !navigator.onLine) {
          // if we're offline, don't try to fetch
          return resp
        } else {
          return fetch(event.request).then(response => {
            // if we're online, try fetching
            // save this to the cache so we're up to date next time we're offline
            return openCache()
            .then(cache => {
               if (response.status === 200) {
                 cache.put(event.request, response.clone())
               } 
            })
            .then(() => response)
          }).catch(err => {
            console.error('error fetching', err)
            // if it fails for some reason and we have
            // a cached response, use that
            if (resp) return resp
          })
        }
      })
    )
  }
})
