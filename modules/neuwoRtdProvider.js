/**
 * @module neuwoRtdProvider
 * @version 3.2.0
 * @author Grzegorz Malisz
 * @see {project-root-directory}/integrationExamples/gpt/neuwoRtdProvider_example.html for an example/testing page.
 * @see {project-root-directory}/test/spec/modules/neuwoRtdProvider_spec.js for unit tests.
 * @description
 * This module is a Prebid.js Real-Time Data (RTD) provider that integrates with the Neuwo API.
 *
 * It fetches contextual marketing categories (IAB content and audience) for the current page from the Neuwo API.
 * The retrieved data is then injected into the bid request as OpenRTB (ORTB2) `site.content.data`
 * and `user.data` fragments, making it available for bidders to use in their decisioning process.
 * Additionally, when enabled, the module populates OpenRTB 2.5 category fields (`ortb2.site.cat`,
 * `ortb2.site.sectioncat`, `ortb2.site.pagecat`, `ortb2.site.content.cat`) with IAB Content Taxonomy 1.0 segments.
 *
 * @see {@link https://docs.prebid.org/dev-docs/add-rtd-submodule.html} for more information on development of Prebid.js RTD modules.
 * @see {@link https://docs.prebid.org/features/firstPartyData.html} for more information on Prebid.js First Party Data.
 * @see {@link https://www.neuwo.ai/} for more information on the Neuwo API.
 */

import { ajax } from "../src/ajax.js";
import { submodule } from "../src/hook.js";
import { detectReferer, getRefererInfo } from "../src/refererDetection.js";
import {
  deepSetValue,
  logError,
  logInfo,
  logWarn,
  mergeDeep,
} from "../src/utils.js";

const MODULE_NAME = "NeuwoRTDModule";
const MODULE_VERSION = "3.2.0";
export const DATA_PROVIDER = "www.neuwo.ai";

const ENRICHMENT_GROUP_KEY = "neuwo_rtd_group";
const ENRICHMENT_GROUPS = {
  ENRICHED: "enriched",
  BASELINE: "baseline",
};
const DEFAULT_ENRICHMENT_RATIO = 0.9;
let enrichmentGroup = ENRICHMENT_GROUPS.ENRICHED;

// Default IAB Content Taxonomy version
const DEFAULT_IAB_CONTENT_TAXONOMY_VERSION = "2.2";

// Maximum number of API requests to keep. Oldest entries are evicted when exceeded.
const MAX_CACHE_ENTRIES = 10;
// API request promises keyed by full API URL: pending while in flight, then the cached response.
let categoryRequests = {};

/**
 * Clears the stored API requests. Primarily used for testing.
 * @private
 */
export function clearCache() {
  categoryRequests = {};
}

// Maps the IAB Content Taxonomy version string to the corresponding segtax ID.
// Based on https://github.com/InteractiveAdvertisingBureau/AdCOM/blob/main/AdCOM%20v1.0%20FINAL.md#list--category-taxonomies-
// prettier-ignore
const IAB_CONTENT_TAXONOMY_MAP = {
  "1.0": 1,
  "2.0": 2,
  "2.1": 5,
  "2.2": 6,
  "3.0": 7,
  "3.1": 9,
};

/**
 * Validates the configuration and initialises the module.
 * Takes the group from the Neuwo page snippet when it set a valid one, otherwise draws it.
 * In the enriched group, also starts the Neuwo API call, or adopts the snippet's data, so the first auction does not have to.
 *
 * @param {Object} config The module configuration.
 * @param {Object} userConsent The user consent object.
 * @returns {boolean} `true` if the module is configured correctly, otherwise `false`.
 */
function init(config, userConsent) {
  logInfo(MODULE_NAME, "init():", "Version " + MODULE_VERSION, config, userConsent);
  const params = config?.params || {};
  if (!params.neuwoApiUrl) {
    logError(MODULE_NAME, "init():", "Missing Neuwo Edge API Endpoint URL");
    return false;
  }
  if (!params.neuwoApiToken) {
    logError(MODULE_NAME, "init():", "Missing Neuwo API Token");
    return false;
  }
  if (!isValidApiUrl(params.neuwoApiUrl)) {
    logWarn(
      MODULE_NAME,
      "init():",
      "There may be a problem with the Neuwo API URL: expected an absolute URL ending in /edge/v1/iab, got:",
      params.neuwoApiUrl
    );
  }
  const pageGroup = getPageGroup();
  if (pageGroup) {
    logInfo(MODULE_NAME, "init():", "Using the group from the page snippet:", pageGroup);
  }
  enrichmentGroup = pageGroup || drawEnrichmentGroup(params.enrichmentShareSettings);
  if (enrichmentGroup === ENRICHMENT_GROUPS.ENRICHED) {
    const apiUrl = buildNeuwoApiUrl(params, detectReferer(window));
    if (apiUrl) {
      getCategories(apiUrl, pageGroup ? window.neuwoRtd.data : undefined);
    }
  }
  return true;
}

/**
 * Fetches contextual data from the Neuwo API and enriches the bid request object with IAB categories.
 * Waits on the stored request for the URL when there is one, so the same URL is never requested twice.
 *
 * @param {Object} reqBidsConfigObj The bid request configuration object.
 * @param {function} callback The callback function to continue the auction.
 * @param {Object} config The module configuration.
 * @param {Object} config.params Configuration parameters.
 * @param {string} config.params.neuwoApiUrl The Neuwo Edge API /edge/v1/iab endpoint URL.
 * @param {string} config.params.neuwoApiToken The Neuwo API authentication token.
 * @param {string} [config.params.websiteToAnalyseUrl] Optional URL to analyze instead of current page.
 * @param {string} [config.params.iabContentTaxonomyVersion="2.2"] IAB Content Taxonomy version.
 * @param {boolean} [config.params.enableCache=true] If true, caches API responses to avoid redundant requests.
 * @param {boolean} [config.params.enableOrtb25Fields=true] If true, populates OpenRTB 2.5 category fields (site.cat, site.sectioncat, site.pagecat, site.content.cat) with IAB Content Taxonomy 1.0 segments.
 * @param {boolean} [config.params.stripAllQueryParams] If true, strips all query parameters from the URL.
 * @param {string[]} [config.params.stripQueryParamsForDomains] List of domains for which to strip all query params.
 * @param {string[]} [config.params.stripQueryParams] List of specific query parameter names to strip.
 * @param {boolean} [config.params.stripFragments] If true, strips URL fragments (hash).
 * @param {Object} [config.params.iabTaxonomyFilters] Per-tier filtering configuration for IAB Taxonomies.
 * @param {Object} [config.params.enrichmentShareSettings] Enrichment share settings: `enabled` and `enrichmentRatio`.
 * @param {Object} userConsent The user consent object.
 */
export function getBidRequestData(
  reqBidsConfigObj,
  callback,
  config,
  userConsent
) {
  logInfo(
    MODULE_NAME,
    "getBidRequestData():",
    "starting getBidRequestData",
    config
  );

  if (enrichmentGroup === ENRICHMENT_GROUPS.BASELINE) {
    logInfo(MODULE_NAME, "getBidRequestData():", "Baseline group: skipping the Neuwo API call");
    callback();
    return;
  }

  const {
    iabContentTaxonomyVersion = DEFAULT_IAB_CONTENT_TAXONOMY_VERSION,
    enableCache = true,
    enableOrtb25Fields = true,
  } = config.params;

  const apiUrl = buildNeuwoApiUrl(config.params);
  if (!apiUrl) {
    callback();
    return;
  }

  const request = getCategories(apiUrl);
  if (!enableCache) {
    delete categoryRequests[apiUrl];
  }
  request
    .then((data) => {
      if (data) {
        injectIabCategories(data, reqBidsConfigObj, iabContentTaxonomyVersion, enableOrtb25Fields);
      }
    })
    .catch((ex) => {
      logError(MODULE_NAME, "getBidRequestData():", "Error processing Neuwo API response:", ex);
    })
    .finally(() => callback());
}

/**
 * Returns the enrichment share group as ad server targeting for every ad unit.
 *
 * @param {string[]} adUnitCodes The ad unit codes of the auction.
 * @returns {Object} `{ [code]: { neuwo_rtd_group: group } }`; the group is `enriched` while enrichment share is off.
 */
export function getTargetingData(adUnitCodes) {
  const targeting = {};
  adUnitCodes.forEach((code) => {
    targeting[code] = { [ENRICHMENT_GROUP_KEY]: enrichmentGroup };
  });
  return targeting;
}

//
// HELPER FUNCTIONS
//

/**
 * Builds the full Neuwo API URL for the page to analyse.
 *
 * @param {Object} params The module configuration parameters, as documented on `getBidRequestData`.
 * @param {function} [readReferer=getRefererInfo] Returns the referer info whose `page` is analysed; `init()` passes an
 *   uncached reader so it does not fix the page URL that the rest of Prebid.js reads before a later `pageUrl`.
 * @returns {string|null} The full API URL, or `null` when there is no URL to analyse.
 */
export function buildNeuwoApiUrl(params, readReferer = getRefererInfo) {
  const {
    websiteToAnalyseUrl,
    neuwoApiUrl,
    neuwoApiToken,
    iabContentTaxonomyVersion = DEFAULT_IAB_CONTENT_TAXONOMY_VERSION,
    enableOrtb25Fields = true,
    stripAllQueryParams,
    stripQueryParamsForDomains,
    stripQueryParams,
    stripFragments,
    iabTaxonomyFilters,
  } = params;

  const rawUrl = websiteToAnalyseUrl || readReferer().page;
  if (!rawUrl) {
    logError(MODULE_NAME, "buildNeuwoApiUrl():", "No URL available to analyse");
    return null;
  }
  const processedUrl = cleanUrl(rawUrl, {
    stripAllQueryParams,
    stripQueryParamsForDomains,
    stripQueryParams,
    stripFragments,
  });
  const pageUrl = encodeURIComponent(processedUrl);
  const contentSegtax =
    IAB_CONTENT_TAXONOMY_MAP[iabContentTaxonomyVersion] ||
    IAB_CONTENT_TAXONOMY_MAP[DEFAULT_IAB_CONTENT_TAXONOMY_VERSION];

  const joiner = neuwoApiUrl.indexOf("?") < 0 ? "?" : "&";
  const urlParams = [
    "token=" + neuwoApiToken,
    "url=" + pageUrl,
    "_neuwo_prod=PrebidModule",
  ];

  // Request both IAB Content Taxonomy (based on config) and IAB Audience Taxonomy (segtax 4)
  urlParams.push("iabVersions=" + contentSegtax);
  urlParams.push("iabVersions=4"); // IAB Audience 1.1

  // Request IAB 1.0 for OpenRTB 2.5 fields if feature enabled.
  // Skip when contentSegtax is already 1 -- already requested above.
  if (enableOrtb25Fields && contentSegtax !== 1) {
    urlParams.push("iabVersions=1"); // IAB Content 1.0
  }

  // Add flattened filter parameters to URL for GET request
  const filterParams = buildFilterQueryParams(
    iabTaxonomyFilters,
    contentSegtax,
    enableOrtb25Fields
  );
  if (filterParams.length > 0) {
    urlParams.push(...filterParams);
  }

  return neuwoApiUrl + joiner + urlParams.join("&");
}

/**
 * Calls the Neuwo API.
 *
 * @param {string} apiUrl The full API URL.
 * @returns {Promise<*>} The parsed response, or `null` when the call or the parsing fails.
 */
function callNeuwoApi(apiUrl) {
  logInfo(MODULE_NAME, "callNeuwoApi():", "Calling Neuwo API Endpoint:", apiUrl);
  return new Promise((resolve) => {
    ajax(apiUrl, {
      success: (response) => {
        logInfo(MODULE_NAME, "callNeuwoApi():", "success():", "Neuwo API raw response:", response);
        try {
          resolve(JSON.parse(response));
        } catch (ex) {
          logError(MODULE_NAME, "callNeuwoApi():", "success():", "Error parsing Neuwo API response JSON:", ex);
          resolve(null);
        }
      },
      error: (err) => {
        logError(MODULE_NAME, "callNeuwoApi():", "error():", "AJAX error:", err);
        resolve(null);
      },
    });
  });
}

/**
 * Returns the stored request for an API URL, starting it when there is none.
 * A request that ends without data is removed, so the next caller retries.
 *
 * @param {string} apiUrl The full API URL, used as the key.
 * @param {Promise<Object|null>|Object|null} [pageData] Data to use instead of calling the API.
 * @returns {Promise<Object|null>} The response, or `null` when there is none.
 */
function getCategories(apiUrl, pageData) {
  if (!categoryRequests[apiUrl]) {
    // Object.keys() preserves string insertion order in modern JS engines.
    const keys = Object.keys(categoryRequests);
    if (keys.length >= MAX_CACHE_ENTRIES) {
      delete categoryRequests[keys[0]];
    }
    const source = pageData != null ? Promise.resolve(pageData) : callNeuwoApi(apiUrl);
    categoryRequests[apiUrl] = source
      .then((data) => (data && typeof data === "object" ? data : null), () => null)
      .then((data) => {
        if (!data) {
          delete categoryRequests[apiUrl];
        }
        return data;
      });
  }
  return categoryRequests[apiUrl];
}

/**
 * Checks that the Neuwo API URL is an absolute URL whose path ends in /edge/v1/iab.
 *
 * @param {string} url The configured Neuwo API URL.
 * @returns {boolean} `true` if the URL looks like a valid /edge/v1/iab endpoint URL, otherwise `false`.
 */
function isValidApiUrl(url) {
  try {
    return /\/edge\/v1\/iab\/?$/.test(new URL(url).pathname);
  } catch (e) {
    return false;
  }
}

/**
 * Returns the enrichment share group set by the Neuwo page snippet in `window.neuwoRtd`, which is only read.
 *
 * @returns {string|undefined} `"enriched"` or `"baseline"`, or `undefined` when the snippet set no valid group.
 */
function getPageGroup() {
  const group = window.neuwoRtd?.group;
  return Object.values(ENRICHMENT_GROUPS).includes(group) ? group : undefined;
}

/**
 * Returns the share of page loads to enrich, falling back to the default when the configured value is invalid.
 *
 * @param {Object} settings The enrichment share settings.
 * @param {number} [settings.enrichmentRatio] Share of page loads in the enriched group, from 0 to 1.
 * @returns {number} The enrichment ratio to use.
 */
function resolveEnrichmentRatio(settings) {
  const ratio = settings.enrichmentRatio;
  if (ratio === undefined) {
    return DEFAULT_ENRICHMENT_RATIO;
  }
  if (typeof ratio !== "number" || !(ratio >= 0 && ratio <= 1)) {
    logWarn(
      MODULE_NAME,
      "resolveEnrichmentRatio():",
      "enrichmentRatio must be a number from 0 to 1, using " + DEFAULT_ENRICHMENT_RATIO + ", got:",
      ratio
    );
    return DEFAULT_ENRICHMENT_RATIO;
  }
  return ratio;
}

/**
 * Draws the enrichment share group for this page load.
 *
 * @param {Object} [settings] The enrichment share settings.
 * @param {boolean} [settings.enabled] Enrichment share runs only when this is `true`.
 * @returns {string} `"enriched"` or `"baseline"`; always `"enriched"` when enrichment share is off.
 */
function drawEnrichmentGroup(settings) {
  if (settings?.enabled !== true) {
    return ENRICHMENT_GROUPS.ENRICHED;
  }
  const group =
    Math.random() < resolveEnrichmentRatio(settings)
      ? ENRICHMENT_GROUPS.ENRICHED
      : ENRICHMENT_GROUPS.BASELINE;
  logInfo(MODULE_NAME, "drawEnrichmentGroup():", "Group drawn at random:", group);
  return group;
}

/**
 * Cleans a URL by stripping query parameters and/or fragments based on the provided configuration.
 *
 * @param {string} url The URL to clean.
 * @param {Object} options Cleaning options.
 * @param {boolean} [options.stripAllQueryParams] If true, strips all query parameters.
 * @param {string[]} [options.stripQueryParamsForDomains] List of domains for which to strip all query params.
 * @param {string[]} [options.stripQueryParams] List of specific query parameter names to strip.
 * @param {boolean} [options.stripFragments] If true, strips URL fragments (hash).
 * @returns {string} The cleaned URL.
 */
export function cleanUrl(url, options = {}) {
  const {
    stripAllQueryParams,
    stripQueryParamsForDomains,
    stripQueryParams,
    stripFragments,
  } = options;

  if (!url) {
    logInfo(
      MODULE_NAME,
      "cleanUrl():",
      "Empty or null URL provided, returning as-is"
    );
    return url;
  }

  logInfo(MODULE_NAME, "cleanUrl():", "Input URL:", url, "Options:", options);

  try {
    const urlObj = new URL(url);

    // Strip fragments if requested
    if (stripFragments === true) {
      urlObj.hash = "";
      logInfo(MODULE_NAME, "cleanUrl():", "Stripped fragment from URL");
    }

    // Option 1: Strip all query params unconditionally
    if (stripAllQueryParams === true) {
      urlObj.search = "";
      const cleanedUrl = urlObj.toString();
      logInfo(MODULE_NAME, "cleanUrl():", "Output URL:", cleanedUrl);
      return cleanedUrl;
    }

    // Option 2: Strip all query params for specific domains
    if (
      Array.isArray(stripQueryParamsForDomains) &&
      stripQueryParamsForDomains.length > 0
    ) {
      const hostname = urlObj.hostname;
      const shouldStripForDomain = stripQueryParamsForDomains.some((domain) => {
        // Support exact match or subdomain match
        return hostname === domain || hostname.endsWith("." + domain);
      });

      if (shouldStripForDomain) {
        urlObj.search = "";
        const cleanedUrl = urlObj.toString();
        logInfo(MODULE_NAME, "cleanUrl():", "Output URL:", cleanedUrl);
        return cleanedUrl;
      }
    }

    // Option 3: Strip specific query parameters
    // Caveats:
    // - "?=value" is treated as query parameter with key "" and value "value"
    // - "??" is treated as query parameter with key "?" and value ""
    if (Array.isArray(stripQueryParams) && stripQueryParams.length > 0) {
      const queryParams = urlObj.searchParams;
      logInfo(
        MODULE_NAME,
        "cleanUrl():",
        `Query parameters to strip: ${stripQueryParams}`
      );
      stripQueryParams.forEach((param) => {
        queryParams.delete(param);
      });
      urlObj.search = queryParams.toString();
      const cleanedUrl = urlObj.toString();
      logInfo(MODULE_NAME, "cleanUrl():", "Output URL:", cleanedUrl);
      return cleanedUrl;
    }

    const finalUrl = urlObj.toString();
    logInfo(MODULE_NAME, "cleanUrl():", "Output URL:", finalUrl);
    return finalUrl;
  } catch (e) {
    logError(MODULE_NAME, "cleanUrl():", "Error cleaning URL:", e);
    return url;
  }
}

/**
 * Injects data into the OpenRTB 2.x global fragments of the bid request object.
 *
 * @param {Object} reqBidsConfigObj The main bid request configuration object.
 * @param {string} path The dot-notation path where the data should be injected (e.g., 'site.content.data').
 * @param {*} data The data to inject at the specified path.
 */
export function injectOrtbData(reqBidsConfigObj, path, data) {
  const container = {};
  deepSetValue(container, path, data);
  mergeDeep(reqBidsConfigObj.ortb2Fragments.global, container);
}

/**
 * Extracts all segment IDs from tier data into a flat array.
 * Used for populating OpenRTB 2.5 category fields and building IAB data objects.
 *
 * @param {Object} tierData The tier data keyed by tier numbers (e.g., {"1": [{id: "IAB12"}], "2": [...]}).
 * @returns {Array<string>} Flat array of segment IDs (e.g., ["IAB12", "IAB12-3", "IAB12-5"]).
 */
export function extractCategoryIds(tierData) {
  const ids = [];

  // Handle null, undefined, non-object, or array tierData
  if (!tierData || typeof tierData !== "object" || Array.isArray(tierData)) {
    return ids;
  }

  // Process ALL tier keys present in tierData
  Object.keys(tierData).forEach((tierKey) => {
    const segments = tierData[tierKey];
    if (Array.isArray(segments)) {
      segments.forEach((item) => {
        if (item?.id) {
          ids.push(item.id);
        }
      });
    }
  });

  return ids;
}

/**
 * Builds an IAB category data object for OpenRTB injection.
 * Dynamically processes all tiers present in the response data.
 *
 * @param {Object} tierData The tier data keyed by tier numbers (e.g., {"1": [...], "2": [...], "3": [...]}).
 * @param {number} segtax The IAB Taxonomy segtax ID.
 * @returns {Object} The OpenRTB data object with name, segment array, and ext.segtax.
 */
export function buildIabData(tierData, segtax) {
  const ids = extractCategoryIds(tierData);
  return {
    name: DATA_PROVIDER,
    segment: ids.map((id) => ({ id })),
    ext: { segtax },
  };
}

/**
 * Builds flattened query parameters from IAB taxonomy filters.
 * Converts human-readable tier names directly to query parameter format for GET requests.
 *
 * @param {Object} iabTaxonomyFilters Publisher's tier filter configuration using human-readable tier names.
 * @param {number} contentSegtax The segtax ID for content taxonomies (determined by iabContentTaxonomyVersion).
 * @param {boolean} [enableOrtb25Fields=true] If true, also applies filters to IAB Content Taxonomy 1.0 (segtax 1) for OpenRTB 2.5 category fields.
 * @returns {Array<string>} Array of query parameter strings (e.g., ["filter_6_1_limit=3", "filter_6_1_threshold=0.5"]).
 *
 * @example
 * Input:  { ContentTier1: { limit: 3, threshold: 0.5 }, AudienceTier3: { limit: 2 } }, contentSegtax=6
 * Output: ["filter_6_1_limit=3", "filter_6_1_threshold=0.5", "filter_4_3_limit=2"]
 */
export function buildFilterQueryParams(
  iabTaxonomyFilters,
  contentSegtax,
  enableOrtb25Fields = true
) {
  const params = [];

  if (!iabTaxonomyFilters || typeof iabTaxonomyFilters !== "object") {
    return params;
  }

  const TIER_TO_SEGTAX = {
    ContentTier1: { segtax: contentSegtax, tier: "1" },
    ContentTier2: { segtax: contentSegtax, tier: "2" },
    ContentTier3: { segtax: contentSegtax, tier: "3" },
    AudienceTier3: { segtax: 4, tier: "3" },
    AudienceTier4: { segtax: 4, tier: "4" },
    AudienceTier5: { segtax: 4, tier: "5" },
  };

  // Build query params from tier mappings
  Object.entries(iabTaxonomyFilters).forEach(([tierName, filter]) => {
    const mapping = TIER_TO_SEGTAX[tierName];
    if (mapping && filter && typeof filter === "object") {
      const segtax = mapping.segtax;
      const tier = mapping.tier;

      // Add each filter property (limit, threshold) as a query parameter
      Object.keys(filter).forEach((prop) => {
        const value = filter[prop];
        if (value !== undefined && value !== null) {
          params.push(`filter_${segtax}_${tier}_${prop}=${value}`);
        }
      });
    }
  });

  // Apply same filters to IAB 1.0 (segtax 1) for OpenRTB 2.5 fields.
  // Skip when contentSegtax is already 1 -- the first loop already emitted filter_1_* params.
  // Note: IAB 1.0 only has tiers 1 and 2 (tier 3 will be ignored if configured)
  if (enableOrtb25Fields && contentSegtax !== 1) {
    if (iabTaxonomyFilters.ContentTier1) {
      Object.keys(iabTaxonomyFilters.ContentTier1).forEach((prop) => {
        const value = iabTaxonomyFilters.ContentTier1[prop];
        if (value !== undefined && value !== null) {
          params.push(`filter_1_1_${prop}=${value}`);
        }
      });
    }

    if (iabTaxonomyFilters.ContentTier2) {
      Object.keys(iabTaxonomyFilters.ContentTier2).forEach((prop) => {
        const value = iabTaxonomyFilters.ContentTier2[prop];
        if (value !== undefined && value !== null) {
          params.push(`filter_1_2_${prop}=${value}`);
        }
      });
    }
  }

  return params;
}

/**
 * Processes the Neuwo API response and injects IAB Content and Audience Segments into the bid request.
 * Extracts Segments from the response and injects them into ORTB2 structure.
 *
 * Response format: { "6": { "1": [{id, name}], "2": [...] }, "4": { "3": [...], "4": [...] } }
 * - Content taxonomies are injected into ortb2.site.content.data
 * - Audience taxonomies are injected into ortb2.user.data
 * - If enableOrtb25Fields is true, IAB 1.0 segments are injected into OpenRTB 2.5 category fields
 *
 * Only injects data if segments exist to avoid adding empty data structures.
 *
 * @param {Object} responseParsed The parsed API response.
 * @param {Object} reqBidsConfigObj The bid request configuration object to be enriched.
 * @param {string} iabContentTaxonomyVersion The IAB Content Taxonomy version for segtax mapping.
 * @param {boolean} [enableOrtb25Fields=true] If true, populates OpenRTB 2.5 category fields with IAB Content Taxonomy 1.0 segments.
 */
export function injectIabCategories(
  responseParsed,
  reqBidsConfigObj,
  iabContentTaxonomyVersion,
  enableOrtb25Fields = true
) {
  if (!responseParsed || typeof responseParsed !== "object") {
    logError(MODULE_NAME, "injectIabCategories():", "Invalid response format");
    return;
  }

  const contentSegtax =
    IAB_CONTENT_TAXONOMY_MAP[iabContentTaxonomyVersion] ||
    IAB_CONTENT_TAXONOMY_MAP[DEFAULT_IAB_CONTENT_TAXONOMY_VERSION];
  const contentSegtaxStr = String(contentSegtax);

  // Extract IAB Content Taxonomy data for the configured version
  const contentTiers = responseParsed[contentSegtaxStr] || {};
  const contentData = buildIabData(contentTiers, contentSegtax);

  // Extract IAB Audience Taxonomy data
  const audienceTiers = responseParsed["4"] || {};
  const audienceData = buildIabData(audienceTiers, 4);

  logInfo(
    MODULE_NAME,
    "injectIabCategories():",
    "contentData structure:",
    contentData
  );
  logInfo(
    MODULE_NAME,
    "injectIabCategories():",
    "audienceData structure:",
    audienceData
  );

  // Inject content and audience data independently to avoid sending empty structures
  if (contentData.segment.length > 0) {
    injectOrtbData(reqBidsConfigObj, "site.content.data", [contentData]);
    logInfo(
      MODULE_NAME,
      "injectIabCategories():",
      "Injected content data into site.content.data"
    );
  } else {
    logInfo(
      MODULE_NAME,
      "injectIabCategories():",
      "No content segments to inject, skipping site.content.data"
    );
  }

  if (audienceData.segment.length > 0) {
    injectOrtbData(reqBidsConfigObj, "user.data", [audienceData]);
    logInfo(
      MODULE_NAME,
      "injectIabCategories():",
      "Injected audience data into user.data"
    );
  } else {
    logInfo(
      MODULE_NAME,
      "injectIabCategories():",
      "No audience segments to inject, skipping user.data"
    );
  }

  // Inject OpenRTB 2.5 category fields if feature enabled
  if (enableOrtb25Fields) {
    const iab10Tiers = responseParsed["1"] || {}; // Segtax 1 = IAB Content 1.0
    const categoryIds = extractCategoryIds(iab10Tiers); // ["IAB12", "IAB12-3", ...]

    if (categoryIds.length > 0) {
      // Inject same array into all four OpenRTB 2.5 category fields
      injectOrtbData(reqBidsConfigObj, "site.cat", categoryIds);
      injectOrtbData(reqBidsConfigObj, "site.sectioncat", categoryIds);
      injectOrtbData(reqBidsConfigObj, "site.pagecat", categoryIds);
      injectOrtbData(reqBidsConfigObj, "site.content.cat", categoryIds);

      logInfo(
        MODULE_NAME,
        "injectIabCategories():",
        "Injected OpenRTB 2.5 category fields:",
        categoryIds
      );
    } else {
      logInfo(
        MODULE_NAME,
        "injectIabCategories():",
        "No IAB 1.0 segments available for OpenRTB 2.5 fields"
      );
    }
  }
}

export const neuwoRtdModule = {
  name: MODULE_NAME,
  init,
  getBidRequestData,
  getTargetingData,
};

submodule("realTimeData", neuwoRtdModule);
