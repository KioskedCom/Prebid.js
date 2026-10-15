# Overview

```
Module Name:    Neuwo Bid Adapter
Module Type:    Bidder Adapter
Maintainer:     engineering@neuwo.ai
```

# Description

Prebid.js bid adapter for the Neuwo ad manager. Supports `banner` and
`native` media types. Banner creatives are returned as rendered ad markup
(`bid.ad`); native creatives are returned as an OpenRTB Native 1.2 asset
bundle parsed into Prebid's flat native shape.

The adapter forwards requests to a single configurable endpoint that speaks
the Neuwo auction JSON contract. By default it hits
`https://admanager.neuwo.ai/bid`; dev/staging environments can override it
per bid via the `endpoint` param.

MRC display viewability (50%/1s, 30%/1s for ≥242 500 px² large displays) is
wired in `onBidWon` via `IntersectionObserver`, firing the server-signed
`viewableBeaconURL` exactly once per winning impression.

# Installation

Copy `neuwoBidAdapter.js` into the Prebid.js `modules/` directory, then
include it in the build:

```
gulp build --modules=neuwoBidAdapter
```

Or together with other adapters:

```
gulp build --modules=neuwoBidAdapter,appnexusBidAdapter
```

# Bid Params

| Name          | Scope    | Type   | Description                                                                 | Example                                  |
|---------------|----------|--------|-----------------------------------------------------------------------------|------------------------------------------|
| `publisherId` | required | string | Publisher organization UUID issued by Neuwo.                                | `"3f8c8b2e-…"`                          |
| `placementId` | required | string | Placement UUID issued by Neuwo.                                             | `"a1b2c3d4-…"`                          |
| `endpoint`    | optional | string | Override auction endpoint (local dev or staging). Defaults to production.   | `"http://localhost:8081/bid"`           |

# Banner ad unit example

```javascript
var adUnits = [{
  code: 'div-gpt-ad-1460505748561-0',
  mediaTypes: {
    banner: {
      sizes: [[300, 250]],
    },
  },
  bids: [{
    bidder: 'neuwo',
    params: {
      publisherId: 'your-publisher-uuid',
      placementId: 'your-placement-uuid',
    },
  }],
}];
```

Only IAB standard sizes are accepted by `isBidRequestValid`; requests with
non-standard sizes are rejected client-side. The full list is:
300x250, 336x280, 728x90, 970x250, 970x90, 300x600, 160x600, 120x600,
250x250, 200x200, 180x150, 120x60, 468x60, 234x60, 88x31, 320x50,
320x100, 300x1050.

# Native ad unit example

```javascript
var adUnits = [{
  code: 'native-ad-slot',
  mediaTypes: {
    native: {
      title:     { required: true, len: 90 },
      image:     { required: true },
      icon:      { required: false },
      body:      { required: false },
      sponsored: { required: false },
      cta:       { required: false },
    },
  },
  bids: [{
    bidder: 'neuwo',
    params: {
      publisherId: 'your-publisher-uuid',
      placementId: 'your-placement-uuid',
    },
  }],
}];
```

`title.required` must be `true` and at least one image asset (`image` or
`icon`) must be declared, otherwise the request is rejected by
`isBidRequestValid`.

# Endpoint override (dev / staging)

```javascript
bids: [{
  bidder: 'neuwo',
  params: {
    publisherId: '...',
    placementId: '...',
    endpoint: 'http://localhost:8081/bid',
  },
}]
```

All bids in a single auction batch share one HTTP POST — the first bid's
`endpoint` is used for the batch.
