import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, NATIVE } from '../src/mediaTypes.js';
import { deepAccess, generateUUID, logWarn } from '../src/utils.js';

const BIDDER_CODE = 'neuwo';
const DEFAULT_ENDPOINT = 'https://admanager.neuwo.ai/bid';
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_TTL_SECONDS = 60;

const NATIVE_IMAGE_TYPE_ICON = 1;
const NATIVE_IMAGE_TYPE_MAIN = 3;

const NATIVE_DATA_TYPE_SPONSORED = 1;
const NATIVE_DATA_TYPE_DESC = 2;
const NATIVE_DATA_TYPE_CTA = 12;

const VIEWABLE_MS = 1000;
const LARGE_DISPLAY_AREA = 242500;

const IAB_STANDARD_SIZES = [
  [300, 250], [336, 280], [728, 90], [970, 250], [970, 90],
  [300, 600], [160, 600], [120, 600], [250, 250], [200, 200],
  [180, 150], [120, 60], [468, 60], [234, 60], [88, 31],
  [320, 50], [320, 100], [300, 1050],
];
const _iabSet = new Set(IAB_STANDARD_SIZES.map(([w, h]) => `${w}x${h}`));

function isStandardSize(w, h) {
  if (w === 0 && h === 0) return true;
  return _iabSet.has(`${w}x${h}`);
}

function buildNativeRequest(native) {
  const assets = [];

  assets.push({
    id: 1,
    required: native.title && native.title.required ? 1 : 0,
    title: { len: (native.title && native.title.len) || 90 },
  });

  if (native.image) {
    assets.push({
      id: 2,
      required: native.image.required ? 1 : 0,
      img: {
        type: NATIVE_IMAGE_TYPE_MAIN,
        wmin: 300,
        hmin: 250,
        mimes: ['image/jpeg', 'image/png', 'image/webp'],
      },
    });
  }

  if (native.icon) {
    assets.push({
      id: 3,
      required: native.icon.required ? 1 : 0,
      img: {
        type: NATIVE_IMAGE_TYPE_ICON,
        wmin: 100,
        hmin: 100,
        mimes: ['image/jpeg', 'image/png', 'image/webp'],
      },
    });
  }

  if (native.body) {
    assets.push({
      id: 4,
      required: native.body.required ? 1 : 0,
      data: { type: NATIVE_DATA_TYPE_DESC, len: 200 },
    });
  }

  if (native.sponsored) {
    assets.push({
      id: 5,
      required: native.sponsored.required ? 1 : 0,
      data: { type: NATIVE_DATA_TYPE_SPONSORED, len: 50 },
    });
  }

  if (native.cta) {
    assets.push({
      id: 6,
      required: native.cta.required ? 1 : 0,
      data: { type: NATIVE_DATA_TYPE_CTA, len: 15 },
    });
  }

  return { ver: '1.2', assets };
}

function decodeNativeResponse(env) {
  const bid = {
    clickUrl: (env.link && env.link.url) || '',
    clickTrackers: (env.link && env.link.clicktrackers) || [],
    impressionTrackers: env.imptrackers || [],
  };

  for (const asset of env.assets || []) {
    switch (asset.id) {
      case 1:
        if (asset.title && asset.title.text) bid.title = asset.title.text;
        break;
      case 2:
        if (asset.img) {
          bid.image = { url: asset.img.url, width: asset.img.w, height: asset.img.h };
        }
        break;
      case 3:
        if (asset.img) {
          bid.icon = { url: asset.img.url, width: asset.img.w, height: asset.img.h };
        }
        break;
      case 4:
        if (asset.data && asset.data.value) bid.body = asset.data.value;
        break;
      case 5:
        if (asset.data && asset.data.value) bid.sponsoredBy = asset.data.value;
        break;
      case 6:
        if (asset.data && asset.data.value) bid.cta = asset.data.value;
        break;
      default:
        break;
    }
  }

  return bid;
}

function fireBeacon(url) {
  if (typeof fetch === 'undefined') return;
  try {
    fetch(url, { keepalive: true, mode: 'no-cors' }).catch(() => {});
  } catch (_e) {}
}

function attachViewability(bid, containerEl) {
  if (!bid.viewableBeaconURL || !containerEl) return;
  if (typeof IntersectionObserver === 'undefined') return;

  const w = bid.width || 0;
  const h = bid.height || 0;
  const threshold = w * h >= LARGE_DISPLAY_AREA ? 0.3 : 0.5;

  let fired = false;
  let timerHandle = null;

  const fire = () => {
    if (fired) return;
    fired = true;
    observer.disconnect();
    fireBeacon(bid.viewableBeaconURL);
  };

  const observer = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (!entry) return;
    if (entry.intersectionRatio >= threshold) {
      if (timerHandle === null) timerHandle = setTimeout(fire, VIEWABLE_MS);
    } else if (timerHandle !== null) {
      clearTimeout(timerHandle);
      timerHandle = null;
    }
  }, { threshold: [0, 0.3, 0.5, 1] });

  observer.observe(containerEl);
}

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER, NATIVE],

  isBidRequestValid(bid) {
    if (!bid || !bid.params) return false;
    const { publisherId, placementId } = bid.params;
    if (typeof publisherId !== 'string' || publisherId.length === 0) return false;
    if (typeof placementId !== 'string' || placementId.length === 0) return false;

    const banner = deepAccess(bid, 'mediaTypes.banner');
    const native = deepAccess(bid, 'mediaTypes.native');

    if (!banner && !native) return false;

    if (banner) {
      const sizes = banner.sizes;
      if (!Array.isArray(sizes) || sizes.length === 0) return false;
      for (const size of sizes) {
        if (!Array.isArray(size) || size.length < 2) return false;
        const [w, h] = size;
        if (!isStandardSize(w, h)) {
          logWarn(`[neuwo] rejecting non-IAB size ${w}x${h}`);
          return false;
        }
      }
    }

    if (native) {
      if (!native.title || !native.title.required) return false;
      if (!native.image && !native.icon) return false;
    }

    return true;
  },

  buildRequests(validBidRequests, bidderRequest) {
    if (!validBidRequests || !validBidRequests.length) return [];
    const first = validBidRequests[0];
    const endpoint = (first.params && first.params.endpoint) || DEFAULT_ENDPOINT;
    const publisherId = (first.params && first.params.publisherId) || '';

    const imps = validBidRequests.map((b) => {
      const banner = deepAccess(b, 'mediaTypes.banner');
      const native = deepAccess(b, 'mediaTypes.native');

      let w = 0;
      let h = 0;
      if (banner && Array.isArray(banner.sizes) && banner.sizes[0]) {
        [w, h] = banner.sizes[0];
      } else if (Array.isArray(b.sizes) && b.sizes[0]) {
        [w, h] = b.sizes[0];
      }

      const imp = {
        id: b.bidId,
        placementId: (b.params && b.params.placementId) || '',
        width: w,
        height: h,
      };

      if (native) {
        imp.native = { request: JSON.stringify(buildNativeRequest(native)) };
      }

      return imp;
    });

    const body = {
      id: generateUUID(),
      publisherId,
      imps,
    };

    const refererInfo = bidderRequest && bidderRequest.refererInfo;
    if (refererInfo) {
      body.site = {
        domain: refererInfo.domain,
        page: refererInfo.page,
      };
    }
    if (bidderRequest && bidderRequest.timeout) {
      body.tmax = bidderRequest.timeout;
    }

    return [{
      method: 'POST',
      url: endpoint,
      data: JSON.stringify(body),
      options: { contentType: 'application/json', withCredentials: false },
    }];
  },

  interpretResponse(serverResponse) {
    const body = serverResponse && serverResponse.body;
    if (!body || !body.bids || !body.bids.length) return [];

    return body.bids.map((bid) => {
      const base = {
        requestId: bid.impId,
        cpm: bid.priceMicros / 1_000_000,
        currency: DEFAULT_CURRENCY,
        creativeId: bid.creativeId,
        ttl: DEFAULT_TTL_SECONDS,
        netRevenue: true,
        meta: { advertiserDomains: [] },
        viewableBeaconURL: bid.viewableBeaconUrl,
        impressionBeaconURL: bid.impressionBeaconUrl,
        clickBeaconURL: bid.clickBeaconUrl,
      };

      if (bid.mediaType === 'native') {
        return {
          ...base,
          width: 0,
          height: 0,
          mediaType: NATIVE,
          native: bid.native ? decodeNativeResponse(bid.native) : {},
        };
      }

      return {
        ...base,
        width: bid.width,
        height: bid.height,
        mediaType: BANNER,
        ad: bid.adm,
      };
    });
  },

  getUserSyncs() {
    return [];
  },

  onBidWon(bid) {
    if (typeof document === 'undefined') return;
    const container = bid.adUnitCode ? document.getElementById(bid.adUnitCode) : null;
    attachViewability(bid, container);
  },
};

registerBidder(spec);
