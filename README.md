# phcode.live
Phcode Live Preview Service

## How to develope/run locally
* `npm run serve` will start this live preview server on `localhost:8001`

By default, phcode.dev will always take the hosted `phcode.live` site instead of localhost:8001 for live
preview hosting. So for development, we need to override this in phcode.dev to this server.

Search for `#LIVE_PREVIEW_STATIC_SERVER_BASE_URL_OVERRIDE` in phcode.dev codebase and follow the steps there
to use this locally hosted live preview server instead of phcode.live.