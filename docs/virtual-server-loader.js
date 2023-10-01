import {Workbox} from 'https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-window.prod.mjs';
import {TRUSTED_ORIGINS} from "./trustedOrigins.js";

const EVENT_REPORT_ERROR = 'REPORT_ERROR';
const EVENT_SERVER_READY = 'SERVER_READY';
const EVENT_GET_PHOENIX_INSTANCE_ID = 'GET_PHOENIX_INSTANCE_ID';
let PHOENIX_INSTANCE_ID;
const expectedBaseURL = `${location.origin}/`;
const urlParams = new URLSearchParams(window.location.search);
const parentOrigin = urlParams.get('parentOrigin');
if(!parentOrigin){
    alert("Missing parentOrigin URL parameter. Embedded server not activated.");
} else if (!TRUSTED_ORIGINS[parentOrigin]) {
    alert("This page can only be embedded from trusted domains " + Object.keys(TRUSTED_ORIGINS));
} else {
    if(Array.from(urlParams.entries()).length !== 1){
        alert("virtual server iframe!! This page should not be loaded with URL params other than parentOrigin.");
    }
    function _getBaseURL() {
        let baseURL = window.location.href;
        if(location.href.indexOf( "?")>-1){
            baseURL = location.href.substring( 0, location.href.indexOf( "?")); // remove query string params
        }
        if(location.href.indexOf( "#")>-1){
            baseURL = baseURL.substring( 0, baseURL.indexOf( "#")); // remove hrefs in page
        }
        return baseURL;
    }
    console.log(_getBaseURL());
    function _isServiceWorkerLoaderPage() {
        // only http(s)://x.y.z/ can load service worker. http(s)://x.y.z/some/path/cant
        // as we will not be able to serve the full dir tree from sub paths.
        const currentURL = _getBaseURL();
        console.log("currentURL and baseURL:", currentURL, expectedBaseURL);
        return currentURL === expectedBaseURL;
    }

    function post(eventName, message) {
        window.parent.postMessage({
            handlerName: "ph-liveServer",
            eventName,
            message
        }, parentOrigin);
    }

    function reportError(message) {
        console.error(message);
        post(EVENT_REPORT_ERROR, message);
    }

    const _serverBroadcastChannel = new BroadcastChannel("virtual_server_broadcast");
    _serverBroadcastChannel.onmessage = function (event) {
        post(event.data.type, event.data)
    }
    let _livePreviewBroadcastChannel;

// messages sent from phoenix parent window tot his iframe
    window.onmessage = function(e) {
        // broadcast to service worker/tabs.
        if(!TRUSTED_ORIGINS[e.origin]){
            console.error("Ignoring post message from untrusted origin " + e.origin +
             '. Trusted origins are ' + Object.keys(TRUSTED_ORIGINS));
            return;
        }
        switch (e.data.type) {
            case 'REQUEST_RESPONSE':
                _serverBroadcastChannel.postMessage(e.data);
                break;
            case 'PHOENIX_INSTANCE_ID':
                PHOENIX_INSTANCE_ID = e.data.PHOENIX_INSTANCE_ID;
                let broadcastChannelID = `${PHOENIX_INSTANCE_ID}_livePreview`;
                if(!_livePreviewBroadcastChannel) {
                    _livePreviewBroadcastChannel = new BroadcastChannel(broadcastChannelID);
                    _livePreviewBroadcastChannel.onmessage = (event) => {
                        // just pass it on to parent phcode
                        post(event.data.type, event.data)
                    };
                } else {
                    console.error("Only one live preview message broadcast channel allowed per iframe. reload page!!!");
                }
                postIfServerReady();
                break;
            default:
                _livePreviewBroadcastChannel.postMessage(e.data);
                break;
        }
    };

    let serviceWorkerLoaded = false;
    function postIfServerReady() {
        if(serviceWorkerLoaded && PHOENIX_INSTANCE_ID) {
            post(EVENT_SERVER_READY, EVENT_SERVER_READY);
        }
    }
    post(EVENT_GET_PHOENIX_INSTANCE_ID, EVENT_GET_PHOENIX_INSTANCE_ID);

    function loadServiceWorker() {
        if (! 'serviceWorker' in navigator) {
            reportError("Live Preivew: Service worker APIs not available. Cannot start virtual server!!!");
            return;
        }
        const wb = new Workbox(`virtual-server-main.js`, {
            // https://developer.chrome.com/blog/fresher-sw/#updateviacache
            updateViaCache: 'none'
        });
        function serviceWorkerReady() {
            console.log('live preview Service worker loader: Server ready.');
            serviceWorkerLoaded = true;
            postIfServerReady();
            if(!localStorage.getItem("loadedTwice")){
                // on first load, we reload the page after service worker is loaded
                // so that the site is cached in service worker cache for offline access.
                // also on second load, we can guarantee that the page is under control of service worker.
                localStorage.setItem("loadedTwice", "true");
                location.reload();
            }
        }

        wb.controlling.then(serviceWorkerReady);

        // Deal with first-run install, if necessary
        wb.addEventListener('installed', (event) => {
            if(!event.isUpdate) {
                console.log('live preview Service worker loader: Web server Worker installed.');
            }
        });

        // Add an event listener to detect when the registered
        // service worker has installed but is waiting to activate.
        wb.addEventListener('waiting', (event) => {
            console.log("live preview Service worker loader: A new service worker is pending load. Trying to update worker now.");
            // Live preview service workers are always updated in phoenix instantly. we dont ask user.
            wb.messageSkipWaiting();
        });

        wb.register();
    }

    if(!_isServiceWorkerLoaderPage()){
        console.log("live preview server: This is not the correct server load URL, redirecting...");
        let currentURL = window.location.href;
        let queryParams = currentURL.replace(_getBaseURL(),"");
        location.href = expectedBaseURL + queryParams;
    } else {
        loadServiceWorker();
    }
}