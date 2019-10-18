const mime = require("mime/lite");
const { parse } = require("powfile");
const { parseResponse } = require("parse-raw-http").parseResponse;

self.addEventListener("install", function(event) {
  console.log("installed, skip waiting");
  // install immediately
  self.skipWaiting();
});

let zip;
let zipLoading = false;

self.addEventListener("message", function(event) {
  loadFile(event.data.payload, event.ports[0]);
});

const loadFile = (file, responsePort) => {
  zipLoading = true;
  const reader = new FileReader();
  reader.readAsArrayBuffer(file);
  reader.onload = async () => {
    const buf = new Buffer(reader.result);
    await loadBuffer(buf);
    if (responsePort) responsePort.postMessage({ type: "zipLoaded" });
  };
  reader.onerror = () => console.error(reader.error);
};

const loadBuffer = async buf => {
  zip = await parse(buf, { unzip: true });
  console.log("new powfile loaded");
  zipLoading = false;
};

const getFromZip = function(url) {
  let pathname
  try {
    pathname = new URL(url).pathname.slice(1);
  } catch (err) {
    pathname = url.slice(1)
  }
  let actualPath = pathname === "" ? "/" : pathname;
  //console.log('getting', actualPath, 'from', zip)
  let fileEntry = zip.file(actualPath);
  if (!fileEntry && actualPath.match(/\/$/)) {
    actualPath = pathname + "index.html";
    fileEntry = zip.file(actualPath);
  }
  console.log("couldn't find", fileEntry)
  if (!fileEntry) return new Response("Powfile entry not found", { status: 404 });
  return fileEntry.async("nodebuffer").then(res => {
    try {
      const parsedResponse = parseResponse(res, {
        decodeContentEncoding: true
      });
      return new Response(parsedResponse.bodyData, {
        headers: parsedResponse.headers
      });
    } catch (err) {
      // not a valid http response, assume it's just a file
      const type = mime.getType(actualPath.match(/\.([^.]+)$/)[1]);
      //console.log("sending file directly, type is", type)
      return new Response(res, {
        headers: {
          "Content-Length": res.length,
          "Content-Type": type
        }
      });
    }
  });
};

const overrideUrl = function(urlString) {
  const url = new URL(urlString);
  if (self.location.origin === url.origin) {
    if (url.pathname.match(/^\/?$/)) return false;
    if (url.pathname.match(/^\/budo\//)) return false;
    if (url.pathname.match(/^\/sw.js/)) return false;
    if (url.pathname.match(/^\/_\/.*/)) {
      console.log("skipping", url.pathname);
      return false;
    }
    return true;
  } else {
    return false;
  }
};

// const readBody = async req => {
//   console.log("reading body from", req)
//   const chunks = [];
//   const body = await req.arrayBuffer()
//   for await (let chunk of body) {
//     chunks.push(chunk);
//   }
//   return Buffer.concat(chunks);
// };

self.addEventListener("fetch", async function(event) {
  console.log("fetch event:", event);
  console.log("url:", event.request.url);
  console.log("zip exists?", zip);
    
  // TODO if zip hasn't loaded, wait for it
  const parsedUrl = new URL(event.request.url);
  if (parsedUrl.pathname === "/_/unload") {
    console.log("!! unloading !!");
    zip = null;
    event.respondWith(
      new Response(null, { status: 302, headers: { Location: "/" } })
    );
  } else if (parsedUrl.pathname === "/_/load") {
    console.log("!! loading !!", event.request)
    // event.respondWith(new Response('boom', { status: 500 }))

    // console.log("event now:", event)
    const loadAndRespond = async () => {
      // this should be a zip body, so read it and parse it
      const body = await event.request.arrayBuffer() 
      await loadBuffer(new Buffer(body))
      const res = new Response(null, {
        status: 201
      })
      console.log("returning", res)
      return res
    }
    event.respondWith(loadAndRespond())
  } else if (overrideUrl(event.request.url) && zip) {
    //event.respondWith(new Promise(resolve => resolve(new Response('hiiii '+event.request.url))))
    event.respondWith(getFromZip(event.request.url));
  } else {
    console.log("letting regular fetch pass through", parsedUrl.toString())
    event.respondWith(fetch(event.request));
  }
  
});
