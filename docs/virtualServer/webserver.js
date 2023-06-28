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

/* global Config, virtualServerBaseURL, HtmlFormatter*/

importScripts('virtualServer/html-formatter.js');

if(!self.Serve){
    (function(){
        const _serverBroadcastChannel = new BroadcastChannel("virtual_server_broadcast");
        const Path = self.path;
        let responseListeners = {};

        function _getNewRequestID() {
            return Math.round( Math.random()*1000000000000);
        }

        const serve = async function (path, phoenixInstanceID) {
            path = Path.normalize(path);
            return new Promise(async (resolve, reject) => { // eslint-disable-line
                function buildResponse(responseData) {
                    return new Response(responseData.body, responseData.config);
                }
                self._debugLivePreviewLog("Service worker: serving instrumented file", path);
                const requestID = _getNewRequestID();
                _serverBroadcastChannel.postMessage({
                    type: "GET_CONTENT",
                    path,
                    requestID,
                    phoenixInstanceID
                });
                responseListeners[requestID] = function (response) {
                    if(response.contents !== "" && !response.contents){
                        self._debugLivePreviewLog(
                            "Service worker: no instrumented file received from phoenix!", path);
                        resolve(buildResponse(HtmlFormatter.format404(path)));
                        return;
                    }
                    const responseData = HtmlFormatter.formatFile(path, response.contents);
                    const headers = response.headers || {};
                    responseData.config.headers = { ...responseData.config.headers, ...headers};
                    resolve(new Response(responseData.body, responseData.config));
                };
            });
        };

        self._debugLivePreviewLog("service worker init");

        function processVirtualServerMessage(event) {
            let eventType = event.data && event.data.type;
            switch (eventType) {
            case 'REQUEST_RESPONSE':
                const requestID = event.data.requestID;
                if(event.data.requestID && responseListeners[requestID]){
                    responseListeners[requestID](event.data);
                    delete responseListeners[requestID];
                    return true;
                }
            }
        }

        _serverBroadcastChannel.onmessage = processVirtualServerMessage;

        self.Serve = {
            serve
        };
    }());
}
