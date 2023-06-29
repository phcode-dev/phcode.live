# phcode.live

Phcode Live Preview Service.

phcode will insert a hidden iframe with the `https://phcode.live` that sets up a
virtual server based on service workers. This repo hosts phcode.live in docs folder.

-   This is mainly used in web builds.
-   Not used in tauri/native builds. In tauri builds, node based server is used
    instead of virtual server.

## How to develope/run locally

By default, phcode.dev will always take the hosted `phcode.live` site instead of
localhost:8001 for live preview hosting. So for development, we need to override
this in [phoenix repo](https://github.com/phcode-dev/phoenix) to this server.

Search for `#LIVE_PREVIEW_STATIC_SERVER_BASE_URL_OVERRIDE` in
[phoenix repo](https://github.com/phcode-dev/phoenix) and follow the steps there
to use this locally hosted live preview server instead of phcode.live.

### on this repo:

-   `npm install`
-   `npm run serve` will start this live preview server on `localhost:8001`

### After that go to phcode repo

-   `npm run serve`
-   Go to browser and launch phoenix dev server link http://localhost:8000
-   Phoenix will now use this live preview server as live preview dev server.
-   Make code changes here as you wish.
-   After development, merge in your changes in this repo.

For prod deployment, push the changes to prod branch after thorough testing and
the changes will be automatically deployed to `phcode.live`.
