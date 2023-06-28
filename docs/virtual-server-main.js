/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * modified by core.ai, based on work by David Humphrey <david.humphrey@senecacolleage.ca> (@humphd)
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */
const _debugSWCacheLogs = false; // change debug to true to see more logs
const _debugSWLivePreviewLogs = false; // change to true to see more logs
function _debugCacheLog(...args) {
    if(_debugSWCacheLogs){
        console.log(...args);
    }
}

self._debugLivePreviewLog = function (...args) {
    if(_debugSWLivePreviewLogs){ // this is set from the debug menu
        console.log(...args);
    }
}

/* global workbox, importScripts, Serve, HtmlFormatter, Config*/
importScripts('virtualfs.js');
importScripts('virtualServer/mime-types.js');
importScripts('virtualServer/content-type.js');
importScripts('virtualServer/webserver.js');
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

self.__WB_DISABLE_DEV_LOGS = _debugSWCacheLogs;
workbox.setConfig({debug: _debugSWCacheLogs});

const Route = workbox.routing.Route;
// other strategies include CacheFirst, NetworkFirst Etc..
const StaleWhileRevalidate = workbox.strategies.StaleWhileRevalidate;
const ExpirationPlugin = workbox.expiration.ExpirationPlugin;
const DAYS_30_IN_SEC = 60 * 60 * 24 * 30;
const CACHE_NAME_EVERYTHING = "everything";
const CACHE_NAME_EXTERNAL = "external";
const SERVING_ROOT = 'vfs';

function _removeParams(url) {
    if(url.indexOf( "?")>-1){
        url = url.substring( 0, url.indexOf( "?")); // remove query string params
    }
    if(location.href.indexOf( "#")>-1){
        url = url.substring( 0, url.indexOf( "#")); // remove hrefs in page
    }
    return url;
}

// service worker controlling route base url. This will be something like https://phcode.dev/ or http://localhost:8000/
let baseURL = location.href;
baseURL = _removeParams(location.href);
if(location.href.indexOf( "/")>-1){
    // http://phcode.dev/index.html -> http://phcode.dev
    baseURL = baseURL.substring( 0, baseURL.lastIndexOf( "/"));
}
if(!baseURL.endsWith('/')){
    baseURL = baseURL + '/';
}
// baseurl is now like https://phcode.dev/ or http://localhost:8000/
console.log("Live Preview Service worker: base URL is: ", baseURL);

// this is the base url where our file system virtual server lives. http://phcode.live/vfs in phoenix or
// http://localhost:8000/vfs in dev builds
const virtualServerBaseURL = `${baseURL}${SERVING_ROOT}`;
console.log("Live Preview Service worker: Virtual server base URL is: ", virtualServerBaseURL);

// Route with trailing slash (i.e., /path/into/filesystem)
const wwwRegex = new RegExp(`${SERVING_ROOT}(/.*)`);
// Route minus the trailing slash

function _isVirtualServing(url) {
    return url.startsWith(virtualServerBaseURL);
}

function _shouldVirtualServe(request) {
    return _isVirtualServing(request.url.href);
}

workbox.routing.registerRoute(
    _shouldVirtualServe,
    ({url}) => {
        // Pull the filesystem path off the url
        let path = url.pathname.match(wwwRegex)[1];
        // Deal with encoding in the filename (e.g., spaces as %20)
        path = decodeURI(path);

        let phoenixInstanceID;
        if(path.startsWith("/PHOENIX_LIVE_PREVIEW_")){
            let pathSplit = path.split("/");
            phoenixInstanceID = pathSplit[1].replace("PHOENIX_LIVE_PREVIEW_","");
            pathSplit.shift();pathSplit.shift();
            path = `/${pathSplit.join("/")}`;
        }

        return Serve.serve(path, phoenixInstanceID);
    },
    'GET'
);

addEventListener('message', (event) => {
    // NB: Do not expect anything to persist in the service worker variables, the service worker may be reset at
    // any time by the browser if it is not in use, and only load it when required. This means that if there is a
    // long inactivity in the page, even if the tab is opened, the service worker will be unloaded by chrome. Then will
    // be re-enabled when needed. Hens some of our stored variables transferred from browser tabs was being erased
    // leading to live preview failures before. Use indexDB persistent storage only inside worker is you want to keep
    // track of data transferred from the main browser tabs, never hold it in variables here!
    let eventType = event.data && event.data.type;
    switch (eventType) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            console.log("Live Preview Service worker skipwaiting for sw update");
            break;
        default:
            console.error("Live Preview Service worker cannot process, received unknown message: ", event);
    }
});

function _isCacheableExternalUrl(url) {
    let EXTERNAL_URLS = [
        'https://storage.googleapis.com/workbox-cdn/'
    ];
    for(let start of EXTERNAL_URLS){
        if(url.startsWith(start)){
            return true;
        }
    }
    return false;
}

// we always try to load main worker scripts and index html from core scripts cache which uses stale while revalidate
// to get aggressive updates.

function _belongsToEverythingCache(request) {
    // now do url checks, Remove # ,http://localhost:9000/dist/styles/images/sprites.svg#leftArrowDisabled.
    // we cache entries with query string parameters in static pages with base url starting with phoenix base
    let href = request.url.split("#")[0];
    if(request.destination === 'video' || request.destination === 'audio'){
        _debugCacheLog("Live Preview Service worker Not Caching audio/video URL: ", request);
        return false;
    }
    if(_isCacheableExternalUrl(href)){
        _debugCacheLog("Live Preview Service worker Not Caching external url in everything cache: ", request);
        return false;
    }
    let disAllowedExtensions =  /.zip$|.map$/i;
    if(href.startsWith(baseURL) && !disAllowedExtensions.test(href)) {
        return true;
    }
    _debugCacheLog("Live Preview Service worker Not Caching URL: ", request);
    return false;
}

// handle all document
const allCachedRoutes = new Route(({ request }) => {
    return (request.method === 'GET'
        && _belongsToEverythingCache(request) && !_isVirtualServing(request.url));
}, new StaleWhileRevalidate({
    cacheName: CACHE_NAME_EVERYTHING,
    plugins: [
        new ExpirationPlugin({
            maxAgeSeconds: DAYS_30_IN_SEC,
            purgeOnQuotaError: true
        })
    ],
    matchOptions: {
        ignoreSearch: true, // ignore query string params in cache so that debug=true/ live preview ids
    },
}));

// scripts with a different origin like third party libs
const externalCachedRoutes = new Route(({ request }) => {
    return request.method === 'GET' && _isCacheableExternalUrl(request.url) && !_isVirtualServing(request.url);
}, new StaleWhileRevalidate({
    cacheName: CACHE_NAME_EXTERNAL,
    plugins: [
        new ExpirationPlugin({
            maxAgeSeconds: DAYS_30_IN_SEC,
            purgeOnQuotaError: true
        })
    ]
}));

workbox.routing.registerRoute(allCachedRoutes);
workbox.routing.registerRoute(externalCachedRoutes);

workbox.core.clientsClaim();
