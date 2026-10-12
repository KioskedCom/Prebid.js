import * as neuwo from "modules/neuwoRtdProvider";
import * as refererDetection from "src/refererDetection.js";
import * as utils from "src/utils.js";
import { server } from "test/mocks/xhr.js";

const NEUWO_API_URL = "https://edge.neuwo.ai/api/aitopics/edge/v1/iab";
const NEUWO_API_TOKEN = "token";
const IAB_CONTENT_TAXONOMY_VERSION = "2.2";

// API config
const config = () => ({
  params: {
    neuwoApiUrl: NEUWO_API_URL,
    neuwoApiToken: NEUWO_API_TOKEN,
    iabContentTaxonomyVersion: IAB_CONTENT_TAXONOMY_VERSION,
  },
});

/**
 * API Response Mock
 * Returns new format with segtax-based structure
 * Field names: id, name, relevance (lowercase)
 * Structure: { "6": { "1": [...], "2": [...] }, "4": { "3": [...] } }
 */
function getNeuwoApiResponse() {
  return {
    7: {
      1: [
        {
          id: "80DV8O",
        },
        {
          id: "52",
        },
        {
          id: "432",
        },
      ],
      2: [
        {
          id: "90",
        },
      ],
      3: [
        {
          id: "106",
        },
      ],
    },
    1: {
      1: [
        {
          id: "IAB12",
        },
      ],
    },
    6: {
      1: [
        {
          id: "52",
        },
      ],
      2: [
        {
          id: "90",
        },
        {
          id: "434",
        },
      ],
      3: [
        {
          id: "106",
        },
      ],
    },
    4: {
      3: [
        {
          id: "49",
        },
        {
          id: "780",
        },
      ],
      4: [
        {
          id: "431",
        },
        {
          id: "196",
        },
        {
          id: "197",
        },
      ],
      5: [
        {
          id: "98",
        },
      ],
    },
  };
}

/**
 * Object generator, like above, written using alternative techniques
 * @returns object with predefined (expected) bidsConfig fields
 */
function bidsConfiglike() {
  return Object.assign(
    {},
    {
      ortb2Fragments: { global: {} },
    }
  );
}

describe("neuwoRtdModule", function () {
  beforeEach(function () {
    // Clear the global cache before each test to ensure test isolation
    neuwo.clearCache();
  });

  describe("init", function () {
    it("should return true when all required parameters are provided", function () {
      expect(
        neuwo.neuwoRtdModule.init(config()),
        "should successfully initialize with a valid configuration"
      ).to.be.true;
    });

    it("should return false when no configuration is provided", function () {
      expect(neuwo.neuwoRtdModule.init(), "should fail initialization if config is missing").to.be
        .false;
    });

    it("should return false when the neuwoApiUrl parameter is missing", function () {
      const incompleteConfig = {
        params: {
          neuwoApiToken: NEUWO_API_TOKEN,
        },
      };
      expect(
        neuwo.neuwoRtdModule.init(incompleteConfig),
        "should fail initialization if neuwoApiUrl is not set"
      ).to.be.false;
    });

    it("should return false when the neuwoApiToken parameter is missing", function () {
      const incompleteConfig = {
        params: {
          neuwoApiUrl: NEUWO_API_URL,
        },
      };
      expect(
        neuwo.neuwoRtdModule.init(incompleteConfig),
        "should fail initialization if neuwoApiToken is not set"
      ).to.be.false;
    });

    describe("endpoint URL check", function () {
      let logWarnStub;

      beforeEach(function () {
        logWarnStub = sinon.stub(utils, "logWarn");
      });

      afterEach(function () {
        logWarnStub.restore();
      });

      function initWithUrl(neuwoApiUrl) {
        const conf = config();
        conf.params.neuwoApiUrl = neuwoApiUrl;
        return neuwo.neuwoRtdModule.init(conf);
      }

      function expectEndpointWarning() {
        expect(logWarnStub.calledOnce, "should warn once").to.be.true;
        expect(logWarnStub.firstCall.args[0]).to.equal("NeuwoRTDModule");
        expect(logWarnStub.firstCall.args[2]).to.match(/problem with the Neuwo API URL/);
      }

      it("should not warn for an /edge/v1/iab URL", function () {
        expect(initWithUrl("https://edge.neuwo.ai/api/aitopics/edge/v1/iab")).to.be.true;
        expect(logWarnStub.called, "should not warn").to.be.false;
      });

      it("should not warn for an /edge/v1/iab URL with a trailing slash", function () {
        expect(initWithUrl("https://edge.neuwo.ai/api/aitopics/edge/v1/iab/")).to.be.true;
        expect(logWarnStub.called, "should not warn").to.be.false;
      });

      it("should not warn for an /edge/v1/iab URL with query parameters", function () {
        expect(initWithUrl("https://edge.neuwo.ai/api/aitopics/edge/v1/iab?environment=production")).to.be.true;
        expect(logWarnStub.called, "should not warn").to.be.false;
      });

      it("should warn but still initialise when the URL has another path", function () {
        expect(initWithUrl("https://proxy.example.com/neuwo")).to.be.true;
        expectEndpointWarning();
      });

      it("should warn when /edge/v1/iab appears only in the query string", function () {
        expect(initWithUrl("https://proxy.example.com/api?redirect=/edge/v1/iab")).to.be.true;
        expectEndpointWarning();
      });

      it("should warn but still initialise when the URL is not absolute", function () {
        expect(initWithUrl("/api/aitopics/edge/v1/iab")).to.be.true;
        expectEndpointWarning();
      });
    });
  });

  describe("buildIabData", function () {
    it("should correctly build the data object for content tiers", function () {
      // format with tier keys "1", "2", "3"
      const tierData = {
        "1": [{ id: "274", name: "Home & Garden", relevance: "0.47" }],
        "2": [{ id: "216", name: "Cooking", relevance: "0.41" }],
        "3": [],
      };
      const segtax = 0;
      const result = neuwo.buildIabData(tierData, segtax);
      const expected = {
        name: neuwo.DATA_PROVIDER,
        segment: [
          { id: "274" },
          { id: "216" },
        ],
        ext: {
          segtax,
        },
      };
      expect(result, "should aggregate segments from all specified content tiers").to.deep.equal(
        expected
      );
    });

    it("should correctly build the data object for audience tiers", function () {
      // format with tier keys "3", "4", "5" for audience
      const tierData = {
        "3": [{ id: "49", name: "Demographic | Gender | Female |", relevance: "0.9923" }],
        "4": [{ id: "127", name: "Demographic | Household Data | 1 Child |", relevance: "0.9673" }],
        "5": [{ id: "98", name: "Demographic | Household Data | Parents with Children |", relevance: "0.9066" }],
      };
      const segtax = 0;
      const result = neuwo.buildIabData(tierData, segtax);
      const expected = {
        name: neuwo.DATA_PROVIDER,
        segment: [
          { id: "49" },
          { id: "127" },
          { id: "98" },
        ],
        ext: {
          segtax,
        },
      };
      expect(result, "should aggregate segments from all specified audience tiers").to.deep.equal(
        expected
      );
    });

    it("should return an empty segment array when tierData is null or undefined", function () {
      const segtax = 4;
      const expected = {
        name: neuwo.DATA_PROVIDER,
        segment: [],
        ext: {
          segtax,
        },
      };
      expect(
        neuwo.buildIabData(null, segtax),
        "should handle null tierData gracefully"
      ).to.deep.equal(expected);
      expect(
        neuwo.buildIabData(undefined, segtax),
        "should handle undefined tierData gracefully"
      ).to.deep.equal(expected);
    });

    it("should return an empty segment array when tierData is empty", function () {
      const tierData = {};
      const segtax = 4;
      const result = neuwo.buildIabData(tierData, segtax);
      const expected = {
        name: neuwo.DATA_PROVIDER,
        segment: [],
        ext: {
          segtax,
        },
      };
      expect(result, "should handle an empty tierData object").to.deep.equal(expected);
    });

    it("should gracefully handle if a tier key contains a non-array value", function () {
      const tierData = {
        "1": { id: "274", name: "Home & Garden" }, // Not an array
        "2": [{ id: "216", name: "Cooking", relevance: "0.41" }],
      };

      const segtax = 4;
      const result = neuwo.buildIabData(tierData, segtax);
      const expected = {
        name: neuwo.DATA_PROVIDER,
        // The segment should only contain data from the valid tier "2"
        segment: [
          {
            id: "216",
          },
        ],
        ext: {
          segtax,
        },
      };

      expect(result, "should skip non-array tier values and process valid ones").to.deep.equal(
        expected
      );
    });

    it("should ignore malformed objects within a tier array", function () {
      // Tier "1" with various malformed objects
      const tierData = {
        "1": [
          { id: "274", name: "Valid Object" },
          { name: "Another Label" }, // Missing 'id' property
          null, // A null value
          "just-a-string", // A string primitive
          {}, // An empty object
        ],
        "2": [{ id: "216", name: "Cooking", relevance: "0.41" }],
      };

      const segtax = 4;
      const result = neuwo.buildIabData(tierData, segtax);
      const expected = {
        name: neuwo.DATA_PROVIDER,
        // The segment should contain the one valid object from tier "1" and the data from tier "2"
        segment: [
          {
            id: "274",
          },
          {
            id: "216",
          },
        ],
        ext: {
          segtax,
        },
      };

      expect(result, "should filter out malformed entries within a tier array").to.deep.equal(
        expected
      );
    });

    it("should return an empty segment array if the entire tierData is not a valid object", function () {
      const segtax = 4;
      const expected = {
        name: neuwo.DATA_PROVIDER,
        segment: [],
        ext: { segtax },
      };
      // Test with a string
      const resultString = neuwo.buildIabData("incorrect format", segtax);
      expect(resultString, "should handle non-object tierData input").to.deep.equal(
        expected
      );
    });
  });

  describe("buildFilterQueryParams", function () {
    it("should return empty array when no filters provided", function () {
      const result = neuwo.buildFilterQueryParams(null, 6);
      expect(result, "should return empty array for null filters").to.deep.equal([]);
    });

    it("should return empty array when filters parameter is undefined", function () {
      const result = neuwo.buildFilterQueryParams(undefined, 6);
      expect(result, "should return empty array for undefined filters").to.deep.equal([]);
    });

    it("should return empty array when filters is empty object", function () {
      const result = neuwo.buildFilterQueryParams({}, 6);
      expect(result, "should return empty array for empty filters").to.deep.equal([]);
    });

    it("should convert ContentTier1 filter correctly", function () {
      const filters = {
        ContentTier1: { limit: 3, threshold: 0.5 }
      };
      const contentSegtax = 6;
      const result = neuwo.buildFilterQueryParams(filters, contentSegtax, false);

      expect(result).to.include("filter_6_1_limit=3");
      expect(result).to.include("filter_6_1_threshold=0.5");
      expect(result).to.have.lengthOf(2);
    });

    it("should convert ContentTier2 filter correctly", function () {
      const filters = {
        ContentTier2: { limit: 5, threshold: 0.6 }
      };
      const contentSegtax = 7;
      const result = neuwo.buildFilterQueryParams(filters, contentSegtax, false);

      expect(result).to.include("filter_7_2_limit=5");
      expect(result).to.include("filter_7_2_threshold=0.6");
      expect(result).to.have.lengthOf(2);
    });

    it("should convert ContentTier3 filter correctly", function () {
      const filters = {
        ContentTier3: { limit: 4, threshold: 0.8 }
      };
      const contentSegtax = 6;
      const result = neuwo.buildFilterQueryParams(filters, contentSegtax, false);

      expect(result).to.include("filter_6_3_limit=4");
      expect(result).to.include("filter_6_3_threshold=0.8");
      expect(result).to.have.lengthOf(2);
    });

    it("should convert AudienceTier3 filter correctly", function () {
      const filters = {
        AudienceTier3: { limit: 2, threshold: 0.9 }
      };
      const contentSegtax = 6;
      const result = neuwo.buildFilterQueryParams(filters, contentSegtax, false);

      expect(result).to.include("filter_4_3_limit=2");
      expect(result).to.include("filter_4_3_threshold=0.9");
      expect(result).to.have.lengthOf(2);
    });

    it("should convert AudienceTier4 filter correctly", function () {
      const filters = {
        AudienceTier4: { limit: 10, threshold: 0.85 }
      };
      const contentSegtax = 6;
      const result = neuwo.buildFilterQueryParams(filters, contentSegtax, false);

      expect(result).to.include("filter_4_4_limit=10");
      expect(result).to.include("filter_4_4_threshold=0.85");
      expect(result).to.have.lengthOf(2);
    });

    it("should convert AudienceTier5 filter correctly", function () {
      const filters = {
        AudienceTier5: { limit: 7, threshold: 0.95 }
      };
      const contentSegtax = 6;
      const result = neuwo.buildFilterQueryParams(filters, contentSegtax, false);

      expect(result).to.include("filter_4_5_limit=7");
      expect(result).to.include("filter_4_5_threshold=0.95");
      expect(result).to.have.lengthOf(2);
    });

    it("should handle multiple content tiers with same segtax", function () {
      const filters = {
        ContentTier1: { limit: 3 },
        ContentTier2: { limit: 5 },
        ContentTier3: { threshold: 0.7 }
      };
      const contentSegtax = 6;
      const result = neuwo.buildFilterQueryParams(filters, contentSegtax, false);

      expect(result).to.include("filter_6_1_limit=3");
      expect(result).to.include("filter_6_2_limit=5");
      expect(result).to.include("filter_6_3_threshold=0.7");
      expect(result).to.have.lengthOf(3);
    });

    it("should handle multiple audience tiers", function () {
      const filters = {
        AudienceTier3: { limit: 2 },
        AudienceTier4: { limit: 4 },
        AudienceTier5: { threshold: 0.85 }
      };
      const result = neuwo.buildFilterQueryParams(filters, 6, false);

      expect(result).to.include("filter_4_3_limit=2");
      expect(result).to.include("filter_4_4_limit=4");
      expect(result).to.include("filter_4_5_threshold=0.85");
      expect(result).to.have.lengthOf(3);
    });

    it("should handle both content and audience tiers together", function () {
      const filters = {
        ContentTier1: { limit: 3, threshold: 0.5 },
        ContentTier2: { limit: 5 },
        AudienceTier3: { limit: 2, threshold: 0.9 },
        AudienceTier4: { threshold: 0.8 }
      };
      const contentSegtax = 6;
      const result = neuwo.buildFilterQueryParams(filters, contentSegtax, false);

      expect(result).to.include("filter_6_1_limit=3");
      expect(result).to.include("filter_6_1_threshold=0.5");
      expect(result).to.include("filter_6_2_limit=5");
      expect(result).to.include("filter_4_3_limit=2");
      expect(result).to.include("filter_4_3_threshold=0.9");
      expect(result).to.include("filter_4_4_threshold=0.8");
      expect(result).to.have.lengthOf(6);
    });

    it("should use different content segtax values correctly", function () {
      const filters = {
        ContentTier1: { limit: 3 }
      };

      // Test with segtax 6 (IAB 2.2)
      const result6 = neuwo.buildFilterQueryParams(filters, 6, false);
      expect(result6).to.include("filter_6_1_limit=3");
      expect(result6).to.not.include("filter_7_1_limit=3");

      // Test with segtax 7 (IAB 3.0)
      const result7 = neuwo.buildFilterQueryParams(filters, 7, false);
      expect(result7).to.include("filter_7_1_limit=3");
      expect(result7).to.not.include("filter_6_1_limit=3");
    });

    it("should ignore unknown tier names", function () {
      const filters = {
        ContentTier1: { limit: 3 },
        UnknownTier: { limit: 10 },
        InvalidTier99: { threshold: 0.5 }
      };
      const result = neuwo.buildFilterQueryParams(filters, 6, false);

      expect(result).to.include("filter_6_1_limit=3");
      expect(result).to.have.lengthOf(1);
    });

    it("should handle filters with only limit property", function () {
      const filters = {
        ContentTier1: { limit: 5 }
      };
      const result = neuwo.buildFilterQueryParams(filters, 6, false);

      expect(result).to.include("filter_6_1_limit=5");
      expect(result).to.not.include.match(/filter_6_1_threshold/);
      expect(result).to.have.lengthOf(1);
    });

    it("should handle filters with only threshold property", function () {
      const filters = {
        AudienceTier3: { threshold: 0.75 }
      };
      const result = neuwo.buildFilterQueryParams(filters, 6, false);

      expect(result).to.include("filter_4_3_threshold=0.75");
      expect(result).to.not.include.match(/filter_4_3_limit/);
      expect(result).to.have.lengthOf(1);
    });

    it("should handle filters with additional custom properties", function () {
      const filters = {
        ContentTier1: { limit: 3, threshold: 0.5, customProp: "value" }
      };
      const result = neuwo.buildFilterQueryParams(filters, 6, false);

      expect(result).to.include("filter_6_1_limit=3");
      expect(result).to.include("filter_6_1_threshold=0.5");
      expect(result).to.include("filter_6_1_customProp=value");
      expect(result).to.have.lengthOf(3);
    });

    it("should handle empty filter objects for tiers", function () {
      const filters = {
        ContentTier1: {},
        AudienceTier3: {}
      };
      const result = neuwo.buildFilterQueryParams(filters, 6, false);

      expect(result).to.have.lengthOf(0);
    });

    it("should not include null limit value", function () {
      const filters = {
        ContentTier1: { limit: null, threshold: 0.5 }
      };
      const result = neuwo.buildFilterQueryParams(filters, 6, false);

      expect(result).to.include("filter_6_1_threshold=0.5");
      expect(result).to.have.lengthOf(1);
    });

    it("should not include undefined limit value", function () {
      const filters = {
        ContentTier1: { limit: undefined, threshold: 0.5 }
      };
      const result = neuwo.buildFilterQueryParams(filters, 6, false);

      expect(result).to.include("filter_6_1_threshold=0.5");
      expect(result).to.have.lengthOf(1);
    });

    it("should not include null threshold value", function () {
      const filters = {
        AudienceTier3: { limit: 5, threshold: null }
      };
      const result = neuwo.buildFilterQueryParams(filters, 6, false);

      expect(result).to.include("filter_4_3_limit=5");
      expect(result).to.have.lengthOf(1);
    });

    it("should not include undefined threshold value", function () {
      const filters = {
        AudienceTier3: { limit: 5, threshold: undefined }
      };
      const result = neuwo.buildFilterQueryParams(filters, 6, false);

      expect(result).to.include("filter_4_3_limit=5");
      expect(result).to.have.lengthOf(1);
    });

    // OpenRTB 2.5 Feature Tests
    describe("with enableOrtb25Fields enabled (default)", function () {
      it("should add IAB 1.0 filter params when ContentTier1 filter is provided", function () {
        const filters = {
          ContentTier1: { limit: 3, threshold: 0.5 }
        };
        const contentSegtax = 6;
        const result = neuwo.buildFilterQueryParams(filters, contentSegtax);

        expect(result).to.include("filter_6_1_limit=3");
        expect(result).to.include("filter_6_1_threshold=0.5");
        expect(result).to.include("filter_1_1_limit=3");
        expect(result).to.include("filter_1_1_threshold=0.5");
        expect(result).to.have.lengthOf(4);
      });

      it("should add IAB 1.0 filter params when ContentTier2 filter is provided", function () {
        const filters = {
          ContentTier2: { limit: 5, threshold: 0.6 }
        };
        const contentSegtax = 6;
        const result = neuwo.buildFilterQueryParams(filters, contentSegtax);

        expect(result).to.include("filter_6_2_limit=5");
        expect(result).to.include("filter_6_2_threshold=0.6");
        expect(result).to.include("filter_1_2_limit=5");
        expect(result).to.include("filter_1_2_threshold=0.6");
        expect(result).to.have.lengthOf(4);
      });

      it("should add IAB 1.0 filter params for both ContentTier1 and ContentTier2", function () {
        const filters = {
          ContentTier1: { limit: 3 },
          ContentTier2: { limit: 5 }
        };
        const contentSegtax = 6;
        const result = neuwo.buildFilterQueryParams(filters, contentSegtax);

        expect(result).to.include("filter_6_1_limit=3");
        expect(result).to.include("filter_6_2_limit=5");
        expect(result).to.include("filter_1_1_limit=3");
        expect(result).to.include("filter_1_2_limit=5");
        expect(result).to.have.lengthOf(4);
      });

      it("should NOT add ContentTier3 filter to IAB 1.0 (only tiers 1-2 exist)", function () {
        const filters = {
          ContentTier1: { limit: 3 },
          ContentTier2: { limit: 5 },
          ContentTier3: { threshold: 0.7 }
        };
        const contentSegtax = 6;
        const result = neuwo.buildFilterQueryParams(filters, contentSegtax);

        expect(result).to.include("filter_6_1_limit=3");
        expect(result).to.include("filter_6_2_limit=5");
        expect(result).to.include("filter_6_3_threshold=0.7");
        expect(result).to.include("filter_1_1_limit=3");
        expect(result).to.include("filter_1_2_limit=5");
        expect(result).to.not.include.match(/filter_1_3/);
        expect(result).to.have.lengthOf(5);
      });

      it("should NOT add audience tier filters to IAB 1.0", function () {
        const filters = {
          AudienceTier3: { limit: 2 },
          AudienceTier4: { limit: 4 }
        };
        const result = neuwo.buildFilterQueryParams(filters, 6);

        expect(result).to.include("filter_4_3_limit=2");
        expect(result).to.include("filter_4_4_limit=4");
        expect(result).to.not.include.match(/filter_1/);
        expect(result).to.have.lengthOf(2);
      });

      it("should add IAB 1.0 filter params alongside audience filters", function () {
        const filters = {
          ContentTier1: { limit: 3 },
          AudienceTier3: { limit: 2 }
        };
        const contentSegtax = 6;
        const result = neuwo.buildFilterQueryParams(filters, contentSegtax);

        expect(result).to.include("filter_6_1_limit=3");
        expect(result).to.include("filter_1_1_limit=3");
        expect(result).to.include("filter_4_3_limit=2");
        expect(result).to.have.lengthOf(3);
      });

      it("should not add segtax 1 params when no content filters are provided", function () {
        const filters = {
          AudienceTier3: { limit: 2 }
        };
        const result = neuwo.buildFilterQueryParams(filters, 6);

        expect(result).to.include("filter_4_3_limit=2");
        expect(result).to.not.include.match(/filter_1/);
        expect(result).to.have.lengthOf(1);
      });

      it("should not add segtax 1 params when filters is empty", function () {
        const result = neuwo.buildFilterQueryParams({}, 6);

        expect(result).to.deep.equal([]);
      });

      it("should not add segtax 1 params when filters is null", function () {
        const result = neuwo.buildFilterQueryParams(null, 6);

        expect(result).to.deep.equal([]);
      });

      it("should work with different content segtax values", function () {
        const filters = {
          ContentTier1: { limit: 3 }
        };

        // Test with segtax 7 (IAB 3.0)
        const result7 = neuwo.buildFilterQueryParams(filters, 7);
        expect(result7).to.include("filter_7_1_limit=3");
        expect(result7).to.include("filter_1_1_limit=3");
        expect(result7).to.have.lengthOf(2);
      });

      it("should not produce duplicate query params when contentSegtax is 1", function () {
        const filters = {
          ContentTier1: { limit: 5, threshold: 0.8 },
          ContentTier2: { limit: 3 }
        };

        const result = neuwo.buildFilterQueryParams(filters, 1);

        // Count occurrences of each param to verify no duplicates
        const countOccurrences = (arr, val) => arr.filter(p => p === val).length;
        expect(countOccurrences(result, "filter_1_1_limit=5"), "filter_1_1_limit should appear once").to.equal(1);
        expect(countOccurrences(result, "filter_1_1_threshold=0.8"), "filter_1_1_threshold should appear once").to.equal(1);
        expect(countOccurrences(result, "filter_1_2_limit=3"), "filter_1_2_limit should appear once").to.equal(1);
        expect(result, "should have exactly 3 params total").to.have.lengthOf(3);
      });
    });

    describe("with enableOrtb25Fields disabled", function () {
      it("should not add IAB 1.0 filter params when disabled", function () {
        const filters = {
          ContentTier1: { limit: 3, threshold: 0.5 },
          ContentTier2: { limit: 5 }
        };
        const contentSegtax = 6;
        const result = neuwo.buildFilterQueryParams(filters, contentSegtax, false);

        expect(result).to.include("filter_6_1_limit=3");
        expect(result).to.include("filter_6_1_threshold=0.5");
        expect(result).to.include("filter_6_2_limit=5");
        expect(result).to.not.include.match(/filter_1/);
        expect(result).to.have.lengthOf(3);
      });

      it("should work correctly with all tier types when disabled", function () {
        const filters = {
          ContentTier1: { limit: 3 },
          ContentTier2: { limit: 5 },
          ContentTier3: { threshold: 0.7 },
          AudienceTier3: { limit: 2 }
        };
        const contentSegtax = 6;
        const result = neuwo.buildFilterQueryParams(filters, contentSegtax, false);

        expect(result).to.include("filter_6_1_limit=3");
        expect(result).to.include("filter_6_2_limit=5");
        expect(result).to.include("filter_6_3_threshold=0.7");
        expect(result).to.include("filter_4_3_limit=2");
        expect(result).to.not.include.match(/filter_1/);
        expect(result).to.have.lengthOf(4);
      });
    });
  });

  describe("extractCategoryIds", function () {
    it("should extract IDs from single tier", function () {
      const tierData = {
        "1": [
          { id: "IAB12" },
          { id: "IAB12-3" }
        ]
      };
      const result = neuwo.extractCategoryIds(tierData);
      expect(result, "should extract all IDs from tier 1").to.deep.equal(["IAB12", "IAB12-3"]);
    });

    it("should extract IDs from multiple tiers", function () {
      const tierData = {
        "1": [
          { id: "IAB12" },
          { id: "IAB12-3" }
        ],
        "2": [
          { id: "IAB12-5" }
        ]
      };
      const result = neuwo.extractCategoryIds(tierData);
      expect(result, "should extract all IDs from all tiers").to.deep.equal(["IAB12", "IAB12-3", "IAB12-5"]);
    });

    it("should handle empty tier arrays", function () {
      const tierData = {
        "1": [],
        "2": [
          { id: "IAB12" }
        ]
      };
      const result = neuwo.extractCategoryIds(tierData);
      expect(result, "should only extract from non-empty tiers").to.deep.equal(["IAB12"]);
    });

    it("should skip items without id property", function () {
      const tierData = {
        "1": [
          { id: "IAB12" },
          { name: "No ID" },
          { id: "IAB12-3" }
        ]
      };
      const result = neuwo.extractCategoryIds(tierData);
      expect(result, "should skip items without id").to.deep.equal(["IAB12", "IAB12-3"]);
    });

    it("should return empty array for null tierData", function () {
      const result = neuwo.extractCategoryIds(null);
      expect(result, "should return empty array for null").to.deep.equal([]);
    });

    it("should return empty array for undefined tierData", function () {
      const result = neuwo.extractCategoryIds(undefined);
      expect(result, "should return empty array for undefined").to.deep.equal([]);
    });

    it("should return empty array for empty object", function () {
      const result = neuwo.extractCategoryIds({});
      expect(result, "should return empty array for empty object").to.deep.equal([]);
    });

    it("should handle non-array tier values", function () {
      const tierData = {
        "1": { id: "IAB12" }, // Not an array
        "2": [
          { id: "IAB13" }
        ]
      };
      const result = neuwo.extractCategoryIds(tierData);
      expect(result, "should skip non-array values").to.deep.equal(["IAB13"]);
    });

    it("should handle null items in tier arrays", function () {
      const tierData = {
        "1": [
          { id: "IAB12" },
          null,
          { id: "IAB12-3" }
        ]
      };
      const result = neuwo.extractCategoryIds(tierData);
      expect(result, "should skip null items").to.deep.equal(["IAB12", "IAB12-3"]);
    });

    it("should handle non-object tierData", function () {
      expect(neuwo.extractCategoryIds("string"), "should handle string").to.deep.equal([]);
      expect(neuwo.extractCategoryIds(123), "should handle number").to.deep.equal([]);
      expect(neuwo.extractCategoryIds([]), "should handle array").to.deep.equal([]);
    });

    it("should extract from all tier numbers", function () {
      const tierData = {
        "1": [{ id: "IAB1" }],
        "2": [{ id: "IAB2" }],
        "3": [{ id: "IAB3" }],
        "4": [{ id: "IAB4" }],
        "5": [{ id: "IAB5" }]
      };
      const result = neuwo.extractCategoryIds(tierData);
      expect(result, "should extract from all tiers").to.deep.equal(["IAB1", "IAB2", "IAB3", "IAB4", "IAB5"]);
    });
  });

  describe("injectOrtbData", function () {
    it("should correctly mutate the request bids config object with new data", function () {
      const reqBidsConfigObj = { ortb2Fragments: { global: {} } };
      neuwo.injectOrtbData(reqBidsConfigObj, "c.d.e.f", { g: "h" });
      expect(
        reqBidsConfigObj.ortb2Fragments.global.c.d.e.f.g,
        "should deeply merge the new data into the target object"
      ).to.equal("h");
    });
  });

  describe("injectIabCategories", function () {
    it("should not inject data when responseParsed is null or undefined", function () {
      const bidsConfig1 = bidsConfiglike();
      const bidsConfig2 = bidsConfiglike();
      const bidsConfigCopy = JSON.parse(JSON.stringify(bidsConfig1));

      neuwo.injectIabCategories(null, bidsConfig1, "2.2");
      neuwo.injectIabCategories(undefined, bidsConfig2, "2.2");

      expect(
        bidsConfig1.ortb2Fragments.global,
        "should not modify ortb2Fragments when response is null"
      ).to.deep.equal(bidsConfigCopy.ortb2Fragments.global);
      expect(
        bidsConfig2.ortb2Fragments.global,
        "should not modify ortb2Fragments when response is undefined"
      ).to.deep.equal(bidsConfigCopy.ortb2Fragments.global);
    });

    it("should not inject data when responseParsed is not an object", function () {
      const bidsConfig1 = bidsConfiglike();
      const bidsConfig2 = bidsConfiglike();
      const bidsConfig3 = bidsConfiglike();
      const bidsConfigCopy = JSON.parse(JSON.stringify(bidsConfig1));

      neuwo.injectIabCategories("invalid string", bidsConfig1, "2.2");
      neuwo.injectIabCategories(123, bidsConfig2, "2.2");
      neuwo.injectIabCategories([1, 2, 3], bidsConfig3, "2.2");

      expect(
        bidsConfig1.ortb2Fragments.global,
        "should not modify ortb2Fragments when response is a string"
      ).to.deep.equal(bidsConfigCopy.ortb2Fragments.global);
      expect(
        bidsConfig2.ortb2Fragments.global,
        "should not modify ortb2Fragments when response is a number"
      ).to.deep.equal(bidsConfigCopy.ortb2Fragments.global);
      expect(
        bidsConfig3.ortb2Fragments.global,
        "should not modify ortb2Fragments when response is an array"
      ).to.deep.equal(bidsConfigCopy.ortb2Fragments.global);
    });

    it("should handle empty object response", function () {
      const bidsConfig = bidsConfiglike();
      const bidsConfigCopy = JSON.parse(JSON.stringify(bidsConfig));

      neuwo.injectIabCategories({}, bidsConfig, "2.2");

      expect(
        bidsConfig.ortb2Fragments.global,
        "should not inject data when response object is empty"
      ).to.deep.equal(bidsConfigCopy.ortb2Fragments.global);
    });

    it("should inject content data when valid content segments exist", function () {
      const response = {
        "6": {
          "1": [{ id: "52", name: "Food & Drink" }],
          "2": [{ id: "90", name: "Cooking" }]
        }
      };
      const bidsConfig = bidsConfiglike();

      neuwo.injectIabCategories(response, bidsConfig, "2.2");

      const contentData = bidsConfig.ortb2Fragments.global?.site?.content?.data?.[0];
      expect(contentData, "should have content data").to.exist;
      expect(contentData.ext.segtax, "should have correct segtax").to.equal(6);
      expect(contentData.segment, "should have segments").to.have.lengthOf(2);
      expect(contentData.segment[0].id, "first segment should match").to.equal("52");
    });

    it("should inject audience data when valid audience segments exist", function () {
      const response = {
        "4": {
          "3": [{ id: "49", name: "Female" }],
          "4": [{ id: "431", name: "Age 25-34" }]
        }
      };
      const bidsConfig = bidsConfiglike();

      neuwo.injectIabCategories(response, bidsConfig, "2.2");

      const userData = bidsConfig.ortb2Fragments.global?.user?.data?.[0];
      expect(userData, "should have user data").to.exist;
      expect(userData.ext.segtax, "should have correct segtax").to.equal(4);
      expect(userData.segment, "should have segments").to.have.lengthOf(2);
      expect(userData.segment[0].id, "first segment should match").to.equal("49");
    });

    it("should inject both content and audience data when both exist", function () {
      const response = {
        "6": {
          "1": [{ id: "52", name: "Food & Drink" }]
        },
        "4": {
          "3": [{ id: "49", name: "Female" }]
        }
      };
      const bidsConfig = bidsConfiglike();

      neuwo.injectIabCategories(response, bidsConfig, "2.2");

      const contentData = bidsConfig.ortb2Fragments.global?.site?.content?.data?.[0];
      const userData = bidsConfig.ortb2Fragments.global?.user?.data?.[0];

      expect(contentData, "should have content data").to.exist;
      expect(userData, "should have user data").to.exist;
      expect(contentData.ext.segtax, "content should have segtax 6").to.equal(6);
      expect(userData.ext.segtax, "audience should have segtax 4").to.equal(4);
    });

    it("should not inject empty audience data when only content segments exist", function () {
      const response = {
        "6": {
          "1": [{ id: "52", name: "Food & Drink" }]
        },
        "4": {}
      };
      const bidsConfig = bidsConfiglike();

      neuwo.injectIabCategories(response, bidsConfig, "2.2");

      const contentData = bidsConfig.ortb2Fragments.global?.site?.content?.data?.[0];
      const userData = bidsConfig.ortb2Fragments.global?.user?.data;
      expect(contentData, "should have content data").to.exist;
      expect(userData, "should not inject empty audience data").to.be.undefined;
    });

    it("should not inject empty content data when only audience segments exist", function () {
      const response = {
        "6": {},
        "4": {
          "3": [{ id: "49", name: "Female" }]
        }
      };
      const bidsConfig = bidsConfiglike();

      neuwo.injectIabCategories(response, bidsConfig, "2.2");

      const contentData = bidsConfig.ortb2Fragments.global?.site?.content?.data;
      const userData = bidsConfig.ortb2Fragments.global?.user?.data?.[0];
      expect(contentData, "should not inject empty content data").to.be.undefined;
      expect(userData, "should have audience data").to.exist;
    });

    it("should handle different IAB Content Taxonomy versions", function () {
      const response = {
        "7": {
          "1": [{ id: "80DV8O", name: "Automotive" }]
        }
      };
      const bidsConfig = bidsConfiglike();

      neuwo.injectIabCategories(response, bidsConfig, "3.0");

      const contentData = bidsConfig.ortb2Fragments.global?.site?.content?.data?.[0];
      expect(contentData, "should have content data").to.exist;
      expect(contentData.ext.segtax, "should use segtax 7 for IAB 3.0").to.equal(7);
    });

    it("should not inject data when segtax has no segments", function () {
      const response1 = { "6": {} };
      const response2 = { "4": {} };
      const response3 = { "6": { "1": [] }, "4": { "3": [] } };
      const bidsConfig1 = bidsConfiglike();
      const bidsConfig2 = bidsConfiglike();
      const bidsConfig3 = bidsConfiglike();

      neuwo.injectIabCategories(response1, bidsConfig1, "2.2");
      neuwo.injectIabCategories(response2, bidsConfig2, "2.2");
      neuwo.injectIabCategories(response3, bidsConfig3, "2.2");

      expect(bidsConfig1.ortb2Fragments.global?.site?.content?.data, "should not inject empty content data").to.be.undefined;
      expect(bidsConfig2.ortb2Fragments.global?.user?.data, "should not inject empty audience data").to.be.undefined;
      expect(bidsConfig3.ortb2Fragments.global?.site?.content?.data, "should not inject content data with empty segments").to.be.undefined;
      expect(bidsConfig3.ortb2Fragments.global?.user?.data, "should not inject audience data with empty segments").to.be.undefined;
    });

    it("should use default taxonomy version when invalid version provided", function () {
      const response = {
        "6": {
          "1": [{ id: "52", name: "Food & Drink" }]
        }
      };
      const bidsConfig = bidsConfiglike();

      neuwo.injectIabCategories(response, bidsConfig, "invalid-version");

      const contentData = bidsConfig.ortb2Fragments.global?.site?.content?.data?.[0];
      expect(contentData, "should have content data").to.exist;
      expect(contentData.ext.segtax, "should default to segtax 6 (IAB 2.2)").to.equal(6);
    });

    // OpenRTB 2.5 Category Fields Tests
    describe("OpenRTB 2.5 category fields", function () {
      describe("with enableOrtb25Fields enabled (default)", function () {
        it("should inject category fields when IAB 1.0 data exists", function () {
          const response = {
            "1": {
              "1": [{ id: "IAB12" }],
              "2": [{ id: "IAB12-3" }, { id: "IAB12-5" }]
            },
            "6": {
              "1": [{ id: "52" }]
            }
          };
          const bidsConfig = bidsConfiglike();

          neuwo.injectIabCategories(response, bidsConfig, "2.2");

          const siteCat = bidsConfig.ortb2Fragments.global?.site?.cat;
          const siteSectioncat = bidsConfig.ortb2Fragments.global?.site?.sectioncat;
          const sitePagecat = bidsConfig.ortb2Fragments.global?.site?.pagecat;
          const contentCat = bidsConfig.ortb2Fragments.global?.site?.content?.cat;

          expect(siteCat, "should have site.cat").to.deep.equal(["IAB12", "IAB12-3", "IAB12-5"]);
          expect(siteSectioncat, "should have site.sectioncat").to.deep.equal(["IAB12", "IAB12-3", "IAB12-5"]);
          expect(sitePagecat, "should have site.pagecat").to.deep.equal(["IAB12", "IAB12-3", "IAB12-5"]);
          expect(contentCat, "should have site.content.cat").to.deep.equal(["IAB12", "IAB12-3", "IAB12-5"]);
        });

        it("should inject category fields with single IAB 1.0 segment", function () {
          const response = {
            "1": {
              "1": [{ id: "IAB12" }]
            }
          };
          const bidsConfig = bidsConfiglike();

          neuwo.injectIabCategories(response, bidsConfig, "2.2");

          const siteCat = bidsConfig.ortb2Fragments.global?.site?.cat;
          expect(siteCat, "should have single category").to.deep.equal(["IAB12"]);
        });

        it("should not inject category fields when IAB 1.0 data is missing", function () {
          const response = {
            "6": {
              "1": [{ id: "52" }]
            }
          };
          const bidsConfig = bidsConfiglike();

          neuwo.injectIabCategories(response, bidsConfig, "2.2");

          const siteCat = bidsConfig.ortb2Fragments.global?.site?.cat;
          const siteSectioncat = bidsConfig.ortb2Fragments.global?.site?.sectioncat;

          expect(siteCat, "should not have site.cat").to.be.undefined;
          expect(siteSectioncat, "should not have site.sectioncat").to.be.undefined;
        });

        it("should not inject category fields when IAB 1.0 data is empty", function () {
          const response = {
            "1": {},
            "6": {
              "1": [{ id: "52" }]
            }
          };
          const bidsConfig = bidsConfiglike();

          neuwo.injectIabCategories(response, bidsConfig, "2.2");

          const siteCat = bidsConfig.ortb2Fragments.global?.site?.cat;
          expect(siteCat, "should not have site.cat with empty IAB 1.0").to.be.undefined;
        });

        it("should not inject category fields when IAB 1.0 tiers are empty arrays", function () {
          const response = {
            "1": {
              "1": [],
              "2": []
            }
          };
          const bidsConfig = bidsConfiglike();

          neuwo.injectIabCategories(response, bidsConfig, "2.2");

          const siteCat = bidsConfig.ortb2Fragments.global?.site?.cat;
          expect(siteCat, "should not have site.cat with empty tier arrays").to.be.undefined;
        });

        it("should handle IAB 1.0 data with malformed items", function () {
          const response = {
            "1": {
              "1": [
                { id: "IAB12" },
                { name: "No ID" },
                null,
                { id: "IAB12-3" }
              ]
            }
          };
          const bidsConfig = bidsConfiglike();

          neuwo.injectIabCategories(response, bidsConfig, "2.2");

          const siteCat = bidsConfig.ortb2Fragments.global?.site?.cat;
          expect(siteCat, "should skip malformed items").to.deep.equal(["IAB12", "IAB12-3"]);
        });

        it("should inject both content data and category fields", function () {
          const response = {
            "1": {
              "1": [{ id: "IAB12" }]
            },
            "6": {
              "1": [{ id: "52", name: "Food & Drink" }]
            }
          };
          const bidsConfig = bidsConfiglike();

          neuwo.injectIabCategories(response, bidsConfig, "2.2");

          const contentData = bidsConfig.ortb2Fragments.global?.site?.content?.data?.[0];
          const siteCat = bidsConfig.ortb2Fragments.global?.site?.cat;

          expect(contentData, "should have content data").to.exist;
          expect(contentData.ext.segtax, "should have segtax 6").to.equal(6);
          expect(siteCat, "should have category fields").to.deep.equal(["IAB12"]);
        });

        it("should merge category fields with existing data", function () {
          const response = {
            "1": {
              "1": [{ id: "IAB12" }]
            }
          };
          const bidsConfig = bidsConfiglike();
          // Pre-populate with existing category data
          bidsConfig.ortb2Fragments.global = {
            site: {
              cat: ["EXISTING1"]
            }
          };

          neuwo.injectIabCategories(response, bidsConfig, "2.2");

          const siteCat = bidsConfig.ortb2Fragments.global?.site?.cat;
          // mergeDeep should deduplicate and merge arrays
          expect(siteCat, "should merge with existing data").to.include("IAB12");
          expect(siteCat, "should preserve existing data").to.include("EXISTING1");
        });
      });

      describe("with enableOrtb25Fields disabled", function () {
        it("should not inject category fields when disabled", function () {
          const response = {
            "1": {
              "1": [{ id: "IAB12" }],
              "2": [{ id: "IAB12-3" }]
            },
            "6": {
              "1": [{ id: "52" }]
            }
          };
          const bidsConfig = bidsConfiglike();

          neuwo.injectIabCategories(response, bidsConfig, "2.2", false);

          const siteCat = bidsConfig.ortb2Fragments.global?.site?.cat;
          const siteSectioncat = bidsConfig.ortb2Fragments.global?.site?.sectioncat;
          const contentData = bidsConfig.ortb2Fragments.global?.site?.content?.data?.[0];

          expect(siteCat, "should not have site.cat").to.be.undefined;
          expect(siteSectioncat, "should not have site.sectioncat").to.be.undefined;
          expect(contentData, "should still have content data (segtax 6)").to.exist;
        });

        it("should inject content data but not category fields when disabled", function () {
          const response = {
            "1": {
              "1": [{ id: "IAB12" }]
            },
            "6": {
              "1": [{ id: "52", name: "Food & Drink" }]
            }
          };
          const bidsConfig = bidsConfiglike();

          neuwo.injectIabCategories(response, bidsConfig, "2.2", false);

          const contentData = bidsConfig.ortb2Fragments.global?.site?.content?.data?.[0];
          const siteCat = bidsConfig.ortb2Fragments.global?.site?.cat;

          expect(contentData, "should have content data").to.exist;
          expect(contentData.ext.segtax).to.equal(6);
          expect(siteCat, "should not have category fields").to.be.undefined;
        });
      });
    });
  });

  describe("getBidRequestData", function () {
    it("should call callback and not make API request when no URL is available", function () {
      const getRefererInfoStub = sinon.stub(refererDetection, "getRefererInfo").returns({ page: "" });
      const bidsConfig = bidsConfiglike();
      const conf = config();
      let callbackCalled = false;

      neuwo.getBidRequestData(bidsConfig, () => { callbackCalled = true; }, conf, "consent data");

      expect(callbackCalled, "callback should be called for empty URL").to.be.true;
      expect(server.requests.length, "should not make API request for empty URL").to.equal(0);
      const contentData = bidsConfig.ortb2Fragments.global?.site?.content?.data;
      expect(contentData, "should not inject any data").to.be.undefined;

      getRefererInfoStub.restore();
    });

    it("should call callback when response processing throws an error", function (done) {
      const bidsConfig = { ortb2Fragments: null };
      const conf = config();
      conf.params.websiteToAnalyseUrl = "https://publisher.works/processing-error";

      neuwo.getBidRequestData(bidsConfig, () => {
        const contentData = bidsConfig.ortb2Fragments?.global?.site?.content?.data;
        expect(contentData, "should not inject data after processing error").to.be.undefined;
        done();
      }, conf, "consent data");

      const request = server.requests[0];
      request.respond(
        200,
        { "Content-Type": "application/json; encoding=UTF-8" },
        JSON.stringify(getNeuwoApiResponse())
      );
    });

    it("should request IAB Content Taxonomy 2.2 when iabContentTaxonomyVersion is not set", function () {
      const bidsConfig = bidsConfiglike();
      const conf = config();
      delete conf.params.iabContentTaxonomyVersion;
      conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php";

      neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
      const request = server.requests[0];

      expect(request.url, "should request segtax 6 by default").to.include("iabVersions=6");
      expect(request.url, "should not send an undefined segtax").to.not.include("iabVersions=undefined");
    });

    it("should fall back to IAB Content Taxonomy 2.2 when iabContentTaxonomyVersion is unknown", function () {
      const bidsConfig = bidsConfiglike();
      const conf = config();
      conf.params.iabContentTaxonomyVersion = "invalid-version";
      conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php";

      neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
      const request = server.requests[0];

      expect(request.url, "should request segtax 6 for an unknown version").to.include("iabVersions=6");
      expect(request.url, "should not send an undefined segtax").to.not.include("iabVersions=undefined");
    });

    describe("when using IAB Content Taxonomy 2.2 (API default)", function () {
      it("should correctly structure the bids object after a successful API response", function () {
        const apiResponse = getNeuwoApiResponse();
        const bidsConfig = bidsConfiglike();
        const conf = config();
        // control xhr api request target for testing
        conf.params.websiteToAnalyseUrl =
          "https://publisher.works/article.php?get=horrible_url_for_testing&id=5";

        neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
        const request = server.requests[0];

        expect(request.url, "The request URL should be a string").to.be.a("string");
        expect(request.url, "The request URL should include the public API token").to.include(
          conf.params.neuwoApiToken
        );
        expect(request.url, "The request URL should include the encoded website URL").to.include(
          encodeURIComponent(conf.params.websiteToAnalyseUrl)
        );
        expect(request.url, "The request URL should include the product identifier").to.include(
          "_neuwo_prod=PrebidModule"
        );
        expect(request.url, "API should include iabVersions parameter for segtax 6").to.include(
          "iabVersions=6"
        );
        expect(request.url, "API should include iabVersions parameter for segtax 4").to.include(
          "iabVersions=4"
        );
        expect(request.method, "API should use GET method").to.equal("GET");

        request.respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify(apiResponse)
        );

        const contentData = bidsConfig.ortb2Fragments.global.site.content.data[0];
        expect(contentData.name, "The data provider name should be correctly set").to.equal(
          neuwo.DATA_PROVIDER
        );
        expect(
          contentData.ext.segtax,
          "The segtax value should correspond to IAB Content Taxonomy 2.2"
        ).to.equal(6);
        expect(
          contentData.segment[0].id,
          "The first segment ID should match the API response"
        ).to.equal(apiResponse["6"]["1"][0].id);
        expect(
          contentData.segment[1].id,
          "The second segment ID should match the API response"
        ).to.equal(apiResponse["6"]["2"][0].id);
      });
    });

    describe("when using IAB Content Taxonomy 1.0", function () {
      it("should correctly structure the bids object after a successful API response", function () {
        const apiResponse = {
          1: { 1: [{ id: "IAB1" }], 2: [{ id: "IAB1-1" }], 3: [{ id: "IAB1-1-1" }] },
          4: { 3: [{ id: "49" }, { id: "780" }], 4: [{ id: "431" }], 5: [{ id: "98" }] },
        };
        const bidsConfig = bidsConfiglike();
        const conf = config();
        conf.params.iabContentTaxonomyVersion = "1.0";
        conf.params.websiteToAnalyseUrl =
          "https://publisher.works/article.php?get=horrible_url_for_testing&id=5";

        neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
        const request = server.requests[0];

        expect(request.url, "The request URL should be a string").to.be.a("string");
        expect(request.url, "The request URL should include the public API token").to.include(
          conf.params.neuwoApiToken
        );
        expect(request.url, "The request URL should include the encoded website URL").to.include(
          encodeURIComponent(conf.params.websiteToAnalyseUrl)
        );
        expect(request.url, "The request URL should include the product identifier").to.include(
          "_neuwo_prod=PrebidModule"
        );
        expect(request.url, "API should include iabVersions parameter for segtax 1").to.include(
          "iabVersions=1"
        );
        expect(request.url, "API should include iabVersions parameter for segtax 4").to.include(
          "iabVersions=4"
        );
        expect(request.method, "API should use GET method").to.equal("GET");

        request.respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify(apiResponse)
        );

        const contentData = bidsConfig.ortb2Fragments.global.site.content.data[0];
        expect(contentData.name, "The data provider name should be correctly set").to.equal(
          neuwo.DATA_PROVIDER
        );
        expect(
          contentData.ext.segtax,
          "The segtax value should correspond to IAB Content Taxonomy 1.0"
        ).to.equal(1);
        expect(
          contentData.segment[0].id,
          "The first segment ID should match the API response"
        ).to.equal(apiResponse["1"]["1"][0].id);
        expect(
          contentData.segment[1].id,
          "The second segment ID should match the API response"
        ).to.equal(apiResponse["1"]["2"][0].id);
      });
    });

    describe("when using IAB Content Taxonomy 3.0", function () {
      it("should correctly structure the bids object after a successful API response", function () {
        const apiResponse = {
          7: { 1: [{ id: "80DV8O" }], 2: [{ id: "90" }], 3: [{ id: "106" }] },
          4: { 3: [{ id: "49" }, { id: "780" }], 4: [{ id: "431" }], 5: [{ id: "98" }] },
        };
        const bidsConfig = bidsConfiglike();
        const conf = config();
        conf.params.iabContentTaxonomyVersion = "3.0";
        conf.params.websiteToAnalyseUrl =
          "https://publisher.works/article.php?get=horrible_url_for_testing&id=5";

        neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
        const request = server.requests[0];

        expect(request.url, "The request URL should be a string").to.be.a("string");
        expect(request.url, "The request URL should include the public API token").to.include(
          conf.params.neuwoApiToken
        );
        expect(request.url, "The request URL should include the encoded website URL").to.include(
          encodeURIComponent(conf.params.websiteToAnalyseUrl)
        );
        expect(request.url, "The request URL should include the product identifier").to.include(
          "_neuwo_prod=PrebidModule"
        );
        expect(request.url, "API should include iabVersions parameter for segtax 7").to.include(
          "iabVersions=7"
        );
        expect(request.url, "API should include iabVersions parameter for segtax 4").to.include(
          "iabVersions=4"
        );
        expect(request.method, "API should use GET method").to.equal("GET");

        request.respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify(apiResponse)
        );

        const contentData = bidsConfig.ortb2Fragments.global.site.content.data[0];
        expect(contentData.name, "The data provider name should be correctly set").to.equal(
          neuwo.DATA_PROVIDER
        );
        expect(
          contentData.ext.segtax,
          "The segtax value should correspond to IAB Content Taxonomy 3.0"
        ).to.equal(7);
        expect(
          contentData.segment[0].id,
          "The first segment ID should match the API response"
        ).to.equal(apiResponse["7"]["1"][0].id);
        expect(
          contentData.segment[1].id,
          "The second segment ID should match the API response"
        ).to.equal(apiResponse["7"]["2"][0].id);
      });
    });

    describe("when using IAB Audience Taxonomy 1.1", function () {
      it("should correctly structure the bids object after a successful API response", function () {
        const apiResponse = getNeuwoApiResponse();
        const bidsConfig = bidsConfiglike();
        const conf = config();
        // control xhr api request target for testing
        conf.params.websiteToAnalyseUrl =
          "https://publisher.works/article.php?get=horrible_url_for_testing&id=5";

        neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
        const request = server.requests[0];

        expect(request.url, "The request URL should be a string").to.be.a("string");
        expect(request.url, "The request URL should include the public API token").to.include(
          conf.params.neuwoApiToken
        );
        expect(request.url, "The request URL should include the encoded website URL").to.include(
          encodeURIComponent(conf.params.websiteToAnalyseUrl)
        );
        expect(request.method, "API should use GET method").to.equal("GET");

        request.respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify(apiResponse)
        );
        const userData = bidsConfig.ortb2Fragments.global.user.data[0];
        expect(userData.name, "The data provider name should be correctly set").to.equal(
          neuwo.DATA_PROVIDER
        );
        expect(
          userData.ext.segtax,
          "The segtax value should correspond to IAB Audience Taxonomy 1.1"
        ).to.equal(4);
        expect(
          userData.segment[0].id,
          "The first segment ID should match the API response (tier 3, first item)"
        ).to.equal(apiResponse["4"]["3"][0].id);
        expect(
          userData.segment[1].id,
          "The second segment ID should match the API response (tier 3, second item)"
        ).to.equal(apiResponse["4"]["3"][1].id);
      });
    });

    it("should not change the bids object structure after an unsuccessful API response", function () {
      const bidsConfig = bidsConfiglike();
      const bidsConfigCopy = bidsConfiglike();
      const conf = config();

      neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
      const request = server.requests[0];
      request.respond(
        404,
        { "Content-Type": "application/json; encoding=UTF-8" },
        JSON.stringify({ detail: "test error" })
      );
      expect(
        bidsConfig,
        "The bids config object should remain unmodified after a failed API call"
      ).to.deep.equal(bidsConfigCopy);
    });

    // OpenRTB 2.5 Feature Tests
    describe("OpenRTB 2.5 category fields", function () {
      describe("with enableOrtb25Fields enabled (default)", function () {
        it("should include iabVersions=1 parameter in API request", function () {
          const bidsConfig = bidsConfiglike();
          const conf = config();
          conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=5";

          neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
          const request = server.requests[0];

          expect(request.url, "should include iabVersions=1").to.include("iabVersions=1");
          expect(request.url, "should include iabVersions=6").to.include("iabVersions=6");
          expect(request.url, "should include iabVersions=4").to.include("iabVersions=4");
        });

        it("should not duplicate iabVersions=1 when iabContentTaxonomyVersion is 1.0", function () {
          const bidsConfig = bidsConfiglike();
          const conf = config();
          conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=5";
          conf.params.iabContentTaxonomyVersion = "1.0";

          neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
          const request = server.requests[0];

          const matches = request.url.match(/iabVersions=1(?!\d)/g) || [];
          expect(matches.length, "iabVersions=1 should appear exactly once").to.equal(1);
          expect(request.url, "should still include iabVersions=4").to.include("iabVersions=4");
        });

        it("should inject category fields when API returns IAB 1.0 data", function () {
          const apiResponse = {
            "1": {
              "1": [{ id: "IAB12" }],
              "2": [{ id: "IAB12-3" }]
            },
            "6": {
              "1": [{ id: "52" }]
            },
            "4": {
              "3": [{ id: "49" }]
            }
          };
          const bidsConfig = bidsConfiglike();
          const conf = config();
          conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=5";

          neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
          const request = server.requests[0];
          request.respond(
            200,
            { "Content-Type": "application/json; encoding=UTF-8" },
            JSON.stringify(apiResponse)
          );

          const siteCat = bidsConfig.ortb2Fragments.global?.site?.cat;
          const contentData = bidsConfig.ortb2Fragments.global?.site?.content?.data?.[0];

          expect(siteCat, "should have site.cat").to.deep.equal(["IAB12", "IAB12-3"]);
          expect(contentData, "should have content data").to.exist;
        });

        it("should send IAB 1.0 filter configuration in URL parameters", function () {
          const apiResponse = {
            "1": {
              "1": [{ id: "IAB12" }],
              "2": [{ id: "IAB12-3" }]
            },
            "6": {
              "1": [{ id: "52" }]
            }
          };
          const bidsConfig = bidsConfiglike();
          const conf = config();
          conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=5";
          conf.params.iabTaxonomyFilters = {
            ContentTier1: { limit: 2 }
          };

          neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");

          const request = server.requests[0];
          expect(request.url, "should have filter for segtax 1 tier 1").to.include("filter_1_1_limit=2");
          expect(request.url, "should have filter for segtax 6 tier 1").to.include("filter_6_1_limit=2");

          request.respond(
            200,
            { "Content-Type": "application/json; encoding=UTF-8" },
            JSON.stringify(apiResponse)
          );

          const siteCat = bidsConfig.ortb2Fragments.global?.site?.cat;
          expect(siteCat, "should inject category fields").to.deep.equal(["IAB12", "IAB12-3"]);
        });
      });

      describe("with enableOrtb25Fields disabled", function () {
        it("should not include iabVersions=1 parameter in API request", function () {
          const bidsConfig = bidsConfiglike();
          const conf = config();
          conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=5";
          conf.params.enableOrtb25Fields = false;

          neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
          const request = server.requests[0];

          expect(request.url, "should not include iabVersions=1").to.not.include("iabVersions=1");
          expect(request.url, "should still include iabVersions=6").to.include("iabVersions=6");
        });

        it("should not inject category fields even if API returns IAB 1.0 data", function () {
          const apiResponse = {
            "1": {
              "1": [{ id: "IAB12" }]
            },
            "6": {
              "1": [{ id: "52" }]
            }
          };
          const bidsConfig = bidsConfiglike();
          const conf = config();
          conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=5";
          conf.params.enableOrtb25Fields = false;

          neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
          const request = server.requests[0];
          request.respond(
            200,
            { "Content-Type": "application/json; encoding=UTF-8" },
            JSON.stringify(apiResponse)
          );

          const siteCat = bidsConfig.ortb2Fragments.global?.site?.cat;
          const contentData = bidsConfig.ortb2Fragments.global?.site?.content?.data?.[0];

          expect(siteCat, "should not have site.cat").to.be.undefined;
          expect(contentData, "should still have content data").to.exist;
        });

        it("should not send IAB 1.0 filters in URL parameters", function () {
          const bidsConfig = bidsConfiglike();
          const conf = config();
          conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=5";
          conf.params.enableOrtb25Fields = false;
          conf.params.iabTaxonomyFilters = {
            ContentTier1: { limit: 3 },
            ContentTier2: { limit: 5 }
          };

          neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
          const request = server.requests[0];

          expect(request.url, "should not have segtax 1 filters").to.not.match(/filter_1_/);
          expect(request.url, "should have segtax 6 filters").to.include("filter_6_1_limit=3");
          expect(request.url, "should have segtax 6 tier 2 filters").to.include("filter_6_2_limit=5");
        });
      });
    });
  });

  describe("cleanUrl", function () {
    describe("when no stripping options are provided", function () {
      it("should return the URL unchanged", function () {
        const url = "https://example.com/page?foo=bar&baz=qux";
        const result = neuwo.cleanUrl(url, {});
        expect(result, "should return the original URL with all query params intact").to.equal(url);
      });

      it("should return the URL unchanged when options object is empty", function () {
        const url = "https://example.com/page?foo=bar";
        const result = neuwo.cleanUrl(url);
        expect(result, "should handle missing options parameter").to.equal(url);
      });
    });

    describe("with query parameters edge cases", function () {
      it("should strip all query parameters from the URL for `stripAllQueryParams` (edge cases)", function () {
        const stripAll = (url) => neuwo.cleanUrl(url, { stripAllQueryParams: true });
        const expected = "https://example.com/page";
        const expectedWithFragment = "https://example.com/page#anchor";

        // Basic formats
        expect(stripAll("https://example.com/page?key=value"), "should remove basic key=value params").to.equal(expected);
        expect(stripAll("https://example.com/page?key="), "should remove params with empty value").to.equal(expected);
        expect(stripAll("https://example.com/page?key"), "should remove params without equals sign").to.equal(expected);
        expect(stripAll("https://example.com/page?=value"), "should remove params with empty key").to.equal(expected);

        // Multiple parameters
        expect(stripAll("https://example.com/page?key1=value1&key2=value2"), "should remove multiple different params").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value1&key=value2"), "should remove multiple params with same key").to.equal(expected);

        // Special characters and encoding
        expect(stripAll("https://example.com/page?key=value%20with%20spaces"), "should remove URL encoded spaces").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value+with+plus"), "should remove plus as space").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value%3D%26%3F"), "should remove encoded special chars").to.equal(expected);
        expect(stripAll("https://example.com/page?key=%"), "should remove incomplete encoding").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value%2"), "should remove malformed encoding").to.equal(expected);

        // Delimiters and syntax edge cases
        expect(stripAll("https://example.com/page?&key=value"), "should remove params with leading ampersand").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value&"), "should remove params with trailing ampersand").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value&&key2=value2"), "should remove params with double ampersand").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value?key2=value2"), "should remove params with question mark delimiter").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value;key2=value2"), "should remove params with semicolon delimiter").to.equal(expected);

        // Empty and missing cases
        expect(stripAll("https://example.com/page?"), "should remove question mark alone").to.equal(expected);
        expect(stripAll("https://example.com/page??"), "should remove double question mark").to.equal(expected);
        expect(stripAll("https://example.com/page"), "should handle URL without query string").to.equal(expected);

        // Unicode and special values
        expect(stripAll("https://example.com/page?key=值"), "should remove unicode characters").to.equal(expected);
        expect(stripAll("https://example.com/page?key=null"), "should remove string 'null'").to.equal(expected);
        expect(stripAll("https://example.com/page?key=undefined"), "should remove string 'undefined'").to.equal(expected);

        // Fragment positioning (fragments are preserved by default)
        expect(stripAll("https://example.com/page?key=value#anchor"), "should remove query params and preserve fragment").to.equal(expectedWithFragment);
        expect(stripAll("https://example.com/page#anchor?key=value"), "should preserve fragment before params").to.equal("https://example.com/page#anchor?key=value");
      });

      it("should strip all query parameters from the URL for `stripQueryParamsForDomains` (edge cases)", function () {
        const stripAll = (url) => neuwo.cleanUrl(url, { stripQueryParamsForDomains: ["example.com"] });
        const expected = "https://example.com/page";
        const expectedWithFragment = "https://example.com/page#anchor";

        // Basic formats
        expect(stripAll("https://example.com/page?key=value"), "should remove basic key=value params").to.equal(expected);
        expect(stripAll("https://example.com/page?key="), "should remove params with empty value").to.equal(expected);
        expect(stripAll("https://example.com/page?key"), "should remove params without equals sign").to.equal(expected);
        expect(stripAll("https://example.com/page?=value"), "should remove params with empty key").to.equal(expected);

        // Multiple parameters
        expect(stripAll("https://example.com/page?key1=value1&key2=value2"), "should remove multiple different params").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value1&key=value2"), "should remove multiple params with same key").to.equal(expected);

        // Special characters and encoding
        expect(stripAll("https://example.com/page?key=value%20with%20spaces"), "should remove URL encoded spaces").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value+with+plus"), "should remove plus as space").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value%3D%26%3F"), "should remove encoded special chars").to.equal(expected);
        expect(stripAll("https://example.com/page?key=%"), "should remove incomplete encoding").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value%2"), "should remove malformed encoding").to.equal(expected);

        // Delimiters and syntax edge cases
        expect(stripAll("https://example.com/page?&key=value"), "should remove params with leading ampersand").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value&"), "should remove params with trailing ampersand").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value&&key2=value2"), "should remove params with double ampersand").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value?key2=value2"), "should remove params with question mark delimiter").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value;key2=value2"), "should remove params with semicolon delimiter").to.equal(expected);

        // Empty and missing cases
        expect(stripAll("https://example.com/page?"), "should remove question mark alone").to.equal(expected);
        expect(stripAll("https://example.com/page??"), "should remove double question mark").to.equal(expected);
        expect(stripAll("https://example.com/page"), "should handle URL without query string").to.equal(expected);

        // Unicode and special values
        expect(stripAll("https://example.com/page?key=值"), "should remove unicode characters").to.equal(expected);
        expect(stripAll("https://example.com/page?key=null"), "should remove string 'null'").to.equal(expected);
        expect(stripAll("https://example.com/page?key=undefined"), "should remove string 'undefined'").to.equal(expected);

        // Fragment positioning (fragments are preserved by default)
        expect(stripAll("https://example.com/page?key=value#anchor"), "should remove query params and preserve fragment").to.equal(expectedWithFragment);
        expect(stripAll("https://example.com/page#anchor?key=value"), "should preserve fragment before params").to.equal("https://example.com/page#anchor?key=value");
      });

      it("should strip all query parameters from the URL for `stripQueryParams` (edge cases)", function () {
        const stripAll = (url) => neuwo.cleanUrl(url, { stripQueryParams: ["key", "key1", "key2", "", "?"] });
        const expected = "https://example.com/page";
        const expectedWithFragment = "https://example.com/page#anchor";

        // Basic formats
        expect(stripAll("https://example.com/page?key=value"), "should remove basic key=value params").to.equal(expected);
        expect(stripAll("https://example.com/page?key="), "should remove params with empty value").to.equal(expected);
        expect(stripAll("https://example.com/page?key"), "should remove params without equals sign").to.equal(expected);
        expect(stripAll("https://example.com/page?=value"), "should remove params with empty key").to.equal(expected);

        // Multiple parameters
        expect(stripAll("https://example.com/page?key1=value1&key2=value2"), "should remove multiple different params").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value1&key=value2"), "should remove multiple params with same key").to.equal(expected);

        // Special characters and encoding
        expect(stripAll("https://example.com/page?key=value%20with%20spaces"), "should remove URL encoded spaces").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value+with+plus"), "should remove plus as space").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value%3D%26%3F"), "should remove encoded special chars").to.equal(expected);
        expect(stripAll("https://example.com/page?key=%"), "should remove incomplete encoding").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value%2"), "should remove malformed encoding").to.equal(expected);

        // Delimiters and syntax edge cases
        expect(stripAll("https://example.com/page?&key=value"), "should remove params with leading ampersand").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value&"), "should remove params with trailing ampersand").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value&&key2=value2"), "should remove params with double ampersand").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value?key2=value2"), "should remove params with question mark delimiter").to.equal(expected);
        expect(stripAll("https://example.com/page?key=value;key2=value2"), "should remove params with semicolon delimiter").to.equal(expected);

        // Empty and missing cases
        expect(stripAll("https://example.com/page?"), "should remove question mark alone").to.equal(expected);
        expect(stripAll("https://example.com/page"), "should handle URL without query string").to.equal(expected);

        // Unicode and special values
        expect(stripAll("https://example.com/page?key=值"), "should remove unicode characters").to.equal(expected);
        expect(stripAll("https://example.com/page?key=null"), "should remove string 'null'").to.equal(expected);
        expect(stripAll("https://example.com/page?key=undefined"), "should remove string 'undefined'").to.equal(expected);

        // Fragment positioning (fragments are preserved by default)
        expect(stripAll("https://example.com/page?key=value#anchor"), "should remove query params and preserve fragment").to.equal(expectedWithFragment);
        expect(stripAll("https://example.com/page#anchor?key=value"), "should preserve fragment before params").to.equal("https://example.com/page#anchor?key=value");
      });
    });

    describe("when stripAllQueryParams is true", function () {
      it("should strip all query parameters from the URL", function () {
        const url = "https://example.com/page?foo=bar&baz=qux&test=123";
        const expected = "https://example.com/page";
        const result = neuwo.cleanUrl(url, { stripAllQueryParams: true });
        expect(result, "should remove all query parameters").to.equal(expected);
      });

      it("should return the URL unchanged if there are no query parameters", function () {
        const url = "https://example.com/page";
        const result = neuwo.cleanUrl(url, { stripAllQueryParams: true });
        expect(result, "should handle URLs without query params").to.equal(url);
      });

      it("should preserve the hash fragment when stripping query params without stripFragments", function () {
        const url = "https://example.com/page?foo=bar#section";
        const expected = "https://example.com/page#section";
        const result = neuwo.cleanUrl(url, { stripAllQueryParams: true });
        expect(result, "should preserve hash fragments by default").to.equal(expected);
      });

      it("should strip hash fragment when stripFragments is enabled", function () {
        const url = "https://example.com/page?foo=bar#section";
        const expected = "https://example.com/page";
        const result = neuwo.cleanUrl(url, { stripAllQueryParams: true, stripFragments: true });
        expect(result, "should strip both query params and fragments").to.equal(expected);
      });

      it("should strip query params but preserve path and protocol", function () {
        const url = "https://subdomain.example.com:8080/path/to/page?param=value";
        const expected = "https://subdomain.example.com:8080/path/to/page";
        const result = neuwo.cleanUrl(url, { stripAllQueryParams: true });
        expect(result, "should preserve protocol, domain, port, and path").to.equal(expected);
      });
    });

    describe("when stripQueryParamsForDomains is provided", function () {
      it("should strip all query params for exact domain match", function () {
        const url = "https://example.com/page?foo=bar&baz=qux";
        const expected = "https://example.com/page";
        const result = neuwo.cleanUrl(url, {
          stripQueryParamsForDomains: ["example.com"]
        });
        expect(result, "should strip params for exact domain match").to.equal(expected);
      });

      it("should strip all query params for subdomain match", function () {
        const url = "https://sub.example.com/page?foo=bar";
        const expected = "https://sub.example.com/page";
        const result = neuwo.cleanUrl(url, {
          stripQueryParamsForDomains: ["example.com"]
        });
        expect(result, "should strip params for subdomains").to.equal(expected);
      });

      it("should not strip query params if domain does not match", function () {
        const url = "https://other.com/page?foo=bar";
        const result = neuwo.cleanUrl(url, {
          stripQueryParamsForDomains: ["example.com"]
        });
        expect(result, "should preserve params for non-matching domains").to.equal(url);
      });

      it("should not strip query params if subdomain is provided for domain", function () {
        const url = "https://example.com/page?foo=bar";
        const result = neuwo.cleanUrl(url, {
          stripQueryParamsForDomains: ["sub.example.com"]
        });
        expect(result, "should preserve params for domain when subdomain is provided").to.equal(url);
      });

      it("should handle multiple domains in the list", function () {
        const url1 = "https://example.com/page?foo=bar";
        const url2 = "https://test.com/page?foo=bar";
        const url3 = "https://other.com/page?foo=bar";
        const domains = ["example.com", "test.com"];

        const result1 = neuwo.cleanUrl(url1, { stripQueryParamsForDomains: domains });
        const result2 = neuwo.cleanUrl(url2, { stripQueryParamsForDomains: domains });
        const result3 = neuwo.cleanUrl(url3, { stripQueryParamsForDomains: domains });

        expect(result1, "should strip params for first domain").to.equal("https://example.com/page");
        expect(result2, "should strip params for second domain").to.equal("https://test.com/page");
        expect(result3, "should preserve params for non-listed domain").to.equal(url3);
      });

      it("should handle deep subdomains correctly", function () {
        const url = "https://deep.sub.example.com/page?foo=bar";
        const expected = "https://deep.sub.example.com/page";
        const result1 = neuwo.cleanUrl(url, {
          stripQueryParamsForDomains: ["example.com"]
        });
        const result2 = neuwo.cleanUrl(url, {
          stripQueryParamsForDomains: ["sub.example.com"]
        });
        expect(result1, "should strip params for deep subdomains with domain matching").to.equal(expected);
        expect(result2, "should strip params for deep subdomains with subdomain matching").to.equal(expected);
      });

      it("should not match partial domain names", function () {
        const url = "https://notexample.com/page?foo=bar";
        const result = neuwo.cleanUrl(url, {
          stripQueryParamsForDomains: ["example.com"]
        });
        expect(result, "should not match partial domain strings").to.equal(url);
      });

      it("should handle empty domain list", function () {
        const url = "https://example.com/page?foo=bar";
        const result = neuwo.cleanUrl(url, { stripQueryParamsForDomains: [] });
        expect(result, "should not strip params with empty domain list").to.equal(url);
      });
    });

    describe("when stripQueryParams is provided", function () {
      it("should strip only specified query parameters", function () {
        const url = "https://example.com/page?foo=bar&baz=qux&keep=this";
        const expected = "https://example.com/page?keep=this";
        const result = neuwo.cleanUrl(url, {
          stripQueryParams: ["foo", "baz"]
        });
        expect(result, "should remove only specified params").to.equal(expected);
      });

      it("should handle single parameter stripping", function () {
        const url = "https://example.com/page?remove=this&keep=that";
        const expected = "https://example.com/page?keep=that";
        const result = neuwo.cleanUrl(url, {
          stripQueryParams: ["remove"]
        });
        expect(result, "should remove single specified param").to.equal(expected);
      });

      it("should return URL without query string if all params are stripped", function () {
        const url = "https://example.com/page?foo=bar&baz=qux";
        const expected = "https://example.com/page";
        const result = neuwo.cleanUrl(url, {
          stripQueryParams: ["foo", "baz"]
        });
        expect(result, "should remove query string when all params stripped").to.equal(expected);
      });

      it("should handle case where specified params do not exist", function () {
        const url = "https://example.com/page?foo=bar";
        const result = neuwo.cleanUrl(url, {
          stripQueryParams: ["nonexistent", "alsonothere"]
        });
        expect(result, "should handle non-existent params gracefully").to.equal(url);
      });

      it("should handle empty param list", function () {
        const url = "https://example.com/page?foo=bar";
        const result = neuwo.cleanUrl(url, { stripQueryParams: [] });
        expect(result, "should not strip params with empty list").to.equal(url);
      });

      it("should preserve param order for remaining params", function () {
        const url = "https://example.com/page?a=1&b=2&c=3&d=4";
        const result = neuwo.cleanUrl(url, {
          stripQueryParams: ["b", "d"]
        });
        expect(result, "should preserve order of remaining params").to.include("a=1");
        expect(result, "should preserve order of remaining params").to.include("c=3");
        expect(result, "should not include stripped param b").to.not.include("b=2");
        expect(result, "should not include stripped param d").to.not.include("d=4");
      });
    });

    describe("error handling", function () {
      it("should return null or undefined input unchanged", function () {
        expect(neuwo.cleanUrl(null, {}), "should handle null input").to.equal(null);
        expect(neuwo.cleanUrl(undefined, {}), "should handle undefined input").to.equal(undefined);
        expect(neuwo.cleanUrl("", {}), "should handle empty string").to.equal("");
      });

      it("should return invalid URL unchanged and log error", function () {
        const invalidUrl = "not-a-valid-url";
        const result = neuwo.cleanUrl(invalidUrl, { stripAllQueryParams: true });
        expect(result, "should return invalid URL unchanged").to.equal(invalidUrl);
      });

      it("should handle malformed URLs gracefully", function () {
        const malformedUrl = "http://";
        const result = neuwo.cleanUrl(malformedUrl, { stripAllQueryParams: true });
        expect(result, "should return malformed URL unchanged").to.equal(malformedUrl);
      });
    });

    describe("when stripFragments is enabled", function () {
      it("should strip URL fragments from URLs without query params", function () {
        const url = "https://example.com/page#section";
        const expected = "https://example.com/page";
        const result = neuwo.cleanUrl(url, { stripFragments: true });
        expect(result, "should remove hash fragment").to.equal(expected);
      });

      it("should strip URL fragments from URLs with query params", function () {
        const url = "https://example.com/page?foo=bar#section";
        const expected = "https://example.com/page?foo=bar";
        const result = neuwo.cleanUrl(url, { stripFragments: true });
        expect(result, "should remove hash fragment and preserve query params").to.equal(expected);
      });

      it("should strip fragments when combined with stripAllQueryParams", function () {
        const url = "https://example.com/page?foo=bar#section";
        const expected = "https://example.com/page";
        const result = neuwo.cleanUrl(url, { stripAllQueryParams: true, stripFragments: true });
        expect(result, "should remove both query params and fragment").to.equal(expected);
      });

      it("should strip fragments when combined with stripQueryParamsForDomains", function () {
        const url = "https://example.com/page?foo=bar#section";
        const expected = "https://example.com/page";
        const result = neuwo.cleanUrl(url, {
          stripQueryParamsForDomains: ["example.com"],
          stripFragments: true
        });
        expect(result, "should remove both query params and fragment for matching domain").to.equal(expected);
      });

      it("should strip fragments when combined with stripQueryParams", function () {
        const url = "https://example.com/page?foo=bar&keep=this#section";
        const expected = "https://example.com/page?keep=this";
        const result = neuwo.cleanUrl(url, {
          stripQueryParams: ["foo"],
          stripFragments: true
        });
        expect(result, "should remove specified query params and fragment").to.equal(expected);
      });

      it("should handle URLs without fragments gracefully", function () {
        const url = "https://example.com/page?foo=bar";
        const expected = "https://example.com/page?foo=bar";
        const result = neuwo.cleanUrl(url, { stripFragments: true });
        expect(result, "should handle URLs without fragments").to.equal(expected);
      });

      it("should handle empty fragments", function () {
        const url = "https://example.com/page#";
        const expected = "https://example.com/page";
        const result = neuwo.cleanUrl(url, { stripFragments: true });
        expect(result, "should remove empty fragment").to.equal(expected);
      });

      it("should handle complex fragments with special characters", function () {
        const url = "https://example.com/page?foo=bar#section-1/subsection?query";
        const expected = "https://example.com/page?foo=bar";
        const result = neuwo.cleanUrl(url, { stripFragments: true });
        expect(result, "should remove complex fragments").to.equal(expected);
      });
    });

    describe("option priority", function () {
      it("should apply stripAllQueryParams first when multiple options are set", function () {
        const url = "https://example.com/page?foo=bar&baz=qux";
        const expected = "https://example.com/page";
        const result = neuwo.cleanUrl(url, {
          stripAllQueryParams: true,
          stripQueryParams: ["foo"]
        });
        expect(result, "stripAllQueryParams should take precedence").to.equal(expected);
      });

      it("should apply stripQueryParamsForDomains before stripQueryParams", function () {
        const url = "https://example.com/page?foo=bar&baz=qux";
        const expected = "https://example.com/page";
        const result = neuwo.cleanUrl(url, {
          stripQueryParamsForDomains: ["example.com"],
          stripQueryParams: ["foo"]
        });
        expect(result, "domain-specific stripping should take precedence").to.equal(expected);
      });

      it("should not strip for non-matching domain even with stripQueryParams set", function () {
        const url = "https://other.com/page?foo=bar&baz=qux";
        const expected = "https://other.com/page?baz=qux";
        const result = neuwo.cleanUrl(url, {
          stripQueryParamsForDomains: ["example.com"],
          stripQueryParams: ["foo"]
        });
        expect(result, "should fall through to stripQueryParams for non-matching domain").to.equal(expected);
      });
    });
  });

  // Integration Tests
  describe("injectIabCategories edge cases and merging", function () {
    it("should not inject data if response contains no segments", function () {
      const apiResponse = { "6": {}, "4": {} }; // Empty response (no segments)
      const bidsConfig = bidsConfiglike();
      const bidsConfigCopy = bidsConfiglike();
      const conf = config();

      neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
      const request = server.requests[0];
      request.respond(
        200,
        { "Content-Type": "application/json; encoding=UTF-8" },
        JSON.stringify(apiResponse)
      );

      // After a successful response with no segments, the global ortb2 fragments should remain empty
      // as the data injection logic only injects when segments exist
      expect(
        bidsConfig.ortb2Fragments.global,
        "The global ORTB fragments should remain empty"
      ).to.deep.equal(bidsConfigCopy.ortb2Fragments.global);
    });

    it("should append content and user data to existing ORTB fragments", function () {
      const apiResponse = getNeuwoApiResponse();
      const bidsConfig = bidsConfiglike();
      // Simulate existing first-party data from another source/module
      const existingContentData = { name: "other_content_provider", segment: [{ id: "1" }] };
      const existingUserData = { name: "other_user_provider", segment: [{ id: "2" }] };

      bidsConfig.ortb2Fragments.global = {
        site: {
          content: {
            data: [existingContentData],
          },
        },
        user: {
          data: [existingUserData],
        },
      };
      const conf = config();

      neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
      const request = server.requests[0];
      request.respond(
        200,
        { "Content-Type": "application/json; encoding=UTF-8" },
        JSON.stringify(apiResponse)
      );

      const siteData = bidsConfig.ortb2Fragments.global.site.content.data;
      const userData = bidsConfig.ortb2Fragments.global.user.data;

      // Check that the existing data is still there (index 0)
      expect(siteData[0], "Existing site.content.data should be preserved").to.deep.equal(
        existingContentData
      );
      expect(userData[0], "Existing user.data should be preserved").to.deep.equal(existingUserData);

      // Check that the new Neuwo data is appended (index 1)
      expect(siteData.length, "site.content.data array should have 2 entries").to.equal(2);
      expect(userData.length, "user.data array should have 2 entries").to.equal(2);
      expect(siteData[1].name, "The appended content data should be from Neuwo").to.equal(
        neuwo.DATA_PROVIDER
      );
      expect(userData[1].name, "The appended user data should be from Neuwo").to.equal(
        neuwo.DATA_PROVIDER
      );
    });

    it("should correctly construct API URL when neuwoApiUrl already contains query parameters", function () {
      const apiResponse = getNeuwoApiResponse();
      const bidsConfig = bidsConfiglike();
      const conf = config();
      // Set API URL that already has query parameters
      conf.params.neuwoApiUrl = "https://edge.neuwo.ai/api/aitopics/edge/v1/iab?environment=production";
      conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=5";

      neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
      const request = server.requests[0];

      // Should use & as joiner instead of ?
      expect(request.url, "URL should contain environment param from base URL").to.include("environment=production");
      expect(request.url, "URL should contain token param joined with &").to.include("&token=");
      expect(request.url, "URL should contain url param").to.include("&url=");
      expect(request.url, "URL should contain product identifier").to.include("&_neuwo_prod=PrebidModule");
      expect(request.url, "URL should include iabVersions parameter").to.include("iabVersions=");
      // Should not have ?? in the URL
      expect(request.url, "URL should not contain double question marks").to.not.include("??");

      request.respond(
        200,
        { "Content-Type": "application/json; encoding=UTF-8" },
        JSON.stringify(apiResponse)
      );

      const contentData = bidsConfig.ortb2Fragments.global.site.content.data[0];
      expect(contentData.name, "Should successfully process response").to.equal(neuwo.DATA_PROVIDER);
    });

    it("should request IAB taxonomies and send filter params whatever the URL path", function () {
      const bidsConfig = bidsConfiglike();
      const conf = config();
      conf.params.neuwoApiUrl = "https://proxy.example.com/neuwo";
      conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php";
      conf.params.iabTaxonomyFilters = { ContentTier1: { limit: 3 } };

      neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
      const request = server.requests[0];

      expect(request.url, "should start with the configured URL").to.match(/^https:\/\/proxy\.example\.com\/neuwo\?/);
      expect(request.url, "should request the content taxonomy").to.include("iabVersions=6");
      expect(request.url, "should request the audience taxonomy").to.include("iabVersions=4");
      expect(request.url, "should send the filter params").to.include("filter_6_1_limit=3");
    });

    it("should inject nothing and still call back when the response has an unexpected shape", function (done) {
      const bidsConfig = bidsConfiglike();
      const conf = config();
      conf.params.websiteToAnalyseUrl = "https://publisher.works/unexpected-shape";

      neuwo.getBidRequestData(bidsConfig, () => {
        expect(bidsConfig.ortb2Fragments.global.site, "should not inject site data").to.be.undefined;
        expect(bidsConfig.ortb2Fragments.global.user, "should not inject user data").to.be.undefined;
        done();
      }, conf, "consent data");

      server.requests[0].respond(
        200,
        { "Content-Type": "application/json; encoding=UTF-8" },
        JSON.stringify({ categories: [] })
      );
    });

    it("should not share a cached response between different iabTaxonomyFilters", function () {
      const conf1 = config();
      conf1.params.websiteToAnalyseUrl = "https://publisher.works/same-page";
      conf1.params.iabTaxonomyFilters = { ContentTier1: { limit: 1 } };
      const conf2 = config();
      conf2.params.websiteToAnalyseUrl = "https://publisher.works/same-page";
      conf2.params.iabTaxonomyFilters = { ContentTier1: { limit: 5 } };

      neuwo.getBidRequestData(bidsConfiglike(), () => {}, conf1, "consent data");
      server.requests[0].respond(
        200,
        { "Content-Type": "application/json; encoding=UTF-8" },
        JSON.stringify(getNeuwoApiResponse())
      );
      neuwo.getBidRequestData(bidsConfiglike(), () => {}, conf2, "consent data");

      expect(server.requests.length, "should make a second request for different filters").to.equal(2);
      expect(server.requests[1].url).to.include("filter_6_1_limit=5");
    });
  });

  describe("getBidRequestData with caching", function () {
    describe("when enableCache is true (default)", function () {
      it("should cache the API response and reuse it on subsequent calls", function () {
        const apiResponse = getNeuwoApiResponse();
        const bidsConfig1 = bidsConfiglike();
        const bidsConfig2 = bidsConfiglike();
        const conf = config();
        conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=1";

        // First call should make an API request
        neuwo.getBidRequestData(bidsConfig1, () => {}, conf, "consent data");
        expect(server.requests.length, "First call should make an API request").to.equal(1);

        const request1 = server.requests[0];
        request1.respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify(apiResponse)
        );

        // Second call should use cached response (no new API request)
        neuwo.getBidRequestData(bidsConfig2, () => {}, conf, "consent data");
        expect(server.requests.length, "Second call should not make a new API request").to.equal(1);

        // Both configs should have identical data (second served from cache)
        const contentData1 = bidsConfig1.ortb2Fragments.global.site.content.data[0];
        const contentData2 = bidsConfig2.ortb2Fragments.global.site.content.data[0];
        expect(contentData1, "First config should have Neuwo data").to.exist;
        expect(contentData2, "Second config should have Neuwo data from cache").to.exist;
        expect(contentData1.name, "First config should have correct provider").to.equal(neuwo.DATA_PROVIDER);
        expect(contentData2.name, "Second config should have correct provider").to.equal(neuwo.DATA_PROVIDER);
        expect(contentData1.segment, "Cached data should have same segments as original").to.deep.equal(contentData2.segment);
      });

      it("should cache when enableCache is explicitly set to true", function () {
        const apiResponse = getNeuwoApiResponse();
        const bidsConfig1 = bidsConfiglike();
        const bidsConfig2 = bidsConfiglike();
        const conf = config();
        conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=2";
        conf.params.enableCache = true;

        // First call
        neuwo.getBidRequestData(bidsConfig1, () => {}, conf, "consent data");
        expect(server.requests.length, "First call should make an API request").to.equal(1);

        const request1 = server.requests[0];
        request1.respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify(apiResponse)
        );

        // Second call should use cache
        neuwo.getBidRequestData(bidsConfig2, () => {}, conf, "consent data");
        expect(server.requests.length, "Second call should use cached response").to.equal(1);
      });

      it("should handle concurrent requests by sharing a pending request promise", function (done) {
        const apiResponse = getNeuwoApiResponse();
        const bidsConfig1 = bidsConfiglike();
        const bidsConfig2 = bidsConfiglike();
        const bidsConfig3 = bidsConfiglike();
        const conf = config();
        conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=concurrent";
        conf.params.enableCache = true;

        let callbackCount = 0;
        const callback = () => {
          callbackCount++;
          if (callbackCount === 3) {
            // All callbacks have been called, now verify the data
            try {
              const contentData1 = bidsConfig1.ortb2Fragments.global.site.content.data[0];
              const contentData2 = bidsConfig2.ortb2Fragments.global.site.content.data[0];
              const contentData3 = bidsConfig3.ortb2Fragments.global.site.content.data[0];

              expect(contentData1, "First config should have Neuwo data").to.exist;
              expect(contentData2, "Second config should have Neuwo data from pending request").to.exist;
              expect(contentData3, "Third config should have Neuwo data from pending request").to.exist;
              expect(contentData1.name, "First config should have correct provider").to.equal(neuwo.DATA_PROVIDER);
              expect(contentData2.name, "Second config should have correct provider").to.equal(neuwo.DATA_PROVIDER);
              expect(contentData3.name, "Third config should have correct provider").to.equal(neuwo.DATA_PROVIDER);
              done();
            } catch (e) {
              done(e);
            }
          }
        };

        // Make three concurrent calls before responding to the first request
        neuwo.getBidRequestData(bidsConfig1, callback, conf, "consent data");
        neuwo.getBidRequestData(bidsConfig2, callback, conf, "consent data");
        neuwo.getBidRequestData(bidsConfig3, callback, conf, "consent data");

        // Only one API request should be made
        expect(server.requests.length, "Only one API request should be made for concurrent calls").to.equal(1);

        const request = server.requests[0];
        request.respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify(apiResponse)
        );
      });

      it("should transition through all three cache states: pending request, then cached response", function (done) {
        const apiResponse = getNeuwoApiResponse();
        const bidsConfig1 = bidsConfiglike();
        const bidsConfig2 = bidsConfiglike();
        const bidsConfig3 = bidsConfiglike();
        const conf = config();
        conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=three-stage";
        conf.params.enableCache = true;

        let callback1and2Count = 0;

        const callback1and2 = () => {
          callback1and2Count++;
          if (callback1and2Count === 2) {
            // Both first and second callbacks have been called
            // Stage 3: Third request should use cached response (not pending request)
            neuwo.getBidRequestData(bidsConfig3, () => {
              try {
                expect(server.requests.length, "Third call should use cache and not make a new API request").to.equal(1);

                // All three configs should have the same data
                const contentData1 = bidsConfig1.ortb2Fragments.global.site.content.data[0];
                const contentData2 = bidsConfig2.ortb2Fragments.global.site.content.data[0];
                const contentData3 = bidsConfig3.ortb2Fragments.global.site.content.data[0];

                expect(contentData1, "First config should have Neuwo data").to.exist;
                expect(contentData2, "Second config should have Neuwo data from pending request").to.exist;
                expect(contentData3, "Third config should have Neuwo data from cache").to.exist;
                expect(contentData1.name, "First config should have correct provider").to.equal(neuwo.DATA_PROVIDER);
                expect(contentData2.name, "Second config should have correct provider").to.equal(neuwo.DATA_PROVIDER);
                expect(contentData3.name, "Third config should have correct provider").to.equal(neuwo.DATA_PROVIDER);
                done();
              } catch (e) {
                done(e);
              }
            }, conf, "consent data");
          }
        };

        // Stage 1: First request initiates API call (creates pending request)
        neuwo.getBidRequestData(bidsConfig1, callback1and2, conf, "consent data");
        expect(server.requests.length, "First call should make an API request").to.equal(1);

        // Stage 2: Second request should attach to pending request before response
        neuwo.getBidRequestData(bidsConfig2, callback1and2, conf, "consent data");
        expect(server.requests.length, "Second call should not make a new API request").to.equal(1);

        // Respond to the API request, which populates the cache
        const request = server.requests[0];
        request.respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify(apiResponse)
        );
      });

      it("should not share cache between requests with different parameters", function (done) {
        const apiResponse1 = getNeuwoApiResponse();
        const apiResponse2 = getNeuwoApiResponse();
        const bidsConfig1 = bidsConfiglike();
        const bidsConfig2 = bidsConfiglike();
        const conf1 = config();
        conf1.params.websiteToAnalyseUrl = "https://publisher.works/page-a";
        conf1.params.enableCache = true;
        const conf2 = config();
        conf2.params.websiteToAnalyseUrl = "https://publisher.works/page-b";
        conf2.params.enableCache = true;

        let callbackCount = 0;
        const callback = () => {
          callbackCount++;
          if (callbackCount === 2) {
            try {
              // Both should have made separate API requests
              expect(server.requests.length, "Should make two separate API requests for different URLs").to.equal(2);
              expect(server.requests[0].url).to.contain("page-a");
              expect(server.requests[1].url).to.contain("page-b");
              done();
            } catch (e) {
              done(e);
            }
          }
        };

        // Two concurrent calls with different URLs
        neuwo.getBidRequestData(bidsConfig1, callback, conf1, "consent data");
        neuwo.getBidRequestData(bidsConfig2, callback, conf2, "consent data");

        expect(server.requests.length, "Should make two separate API requests").to.equal(2);

        server.requests[0].respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify(apiResponse1)
        );
        server.requests[1].respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify(apiResponse2)
        );
      });

      it("should use cache for same URL but make new request after config change", function () {
        const apiResponse = getNeuwoApiResponse();
        const bidsConfig1 = bidsConfiglike();
        const bidsConfig2 = bidsConfiglike();
        const bidsConfig3 = bidsConfiglike();
        const conf = config();
        conf.params.websiteToAnalyseUrl = "https://publisher.works/page-a";
        conf.params.enableCache = true;

        // First call
        neuwo.getBidRequestData(bidsConfig1, () => {}, conf, "consent data");
        expect(server.requests.length).to.equal(1);
        server.requests[0].respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify(apiResponse)
        );

        // Second call with same URL - should use cache
        neuwo.getBidRequestData(bidsConfig2, () => {}, conf, "consent data");
        expect(server.requests.length, "Same URL should use cache").to.equal(1);

        // Third call with different URL (simulating config change) - should make new request
        conf.params.websiteToAnalyseUrl = "https://publisher.works/page-b";
        neuwo.getBidRequestData(bidsConfig3, () => {}, conf, "consent data");
        expect(server.requests.length, "Different URL should make new request").to.equal(2);
        expect(server.requests[1].url).to.contain("page-b");
      });

      it("should not share cache when iabContentTaxonomyVersion changes", function () {
        const apiResponse = getNeuwoApiResponse();
        const bidsConfig1 = bidsConfiglike();
        const bidsConfig2 = bidsConfiglike();
        const bidsConfig3 = bidsConfiglike();
        const conf = config();
        conf.params.websiteToAnalyseUrl = "https://publisher.works/same-page";
        conf.params.enableCache = true;
        conf.params.iabContentTaxonomyVersion = "2.2";

        // First call with taxonomy 2.2
        neuwo.getBidRequestData(bidsConfig1, () => {}, conf, "consent data");
        expect(server.requests.length).to.equal(1);
        expect(server.requests[0].url).to.contain("iabVersions=6"); // segtax 6 = taxonomy 2.2
        server.requests[0].respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify(apiResponse)
        );

        // Second call with same taxonomy - should use cache
        neuwo.getBidRequestData(bidsConfig2, () => {}, conf, "consent data");
        expect(server.requests.length, "Same taxonomy version should use cache").to.equal(1);

        // Third call with different taxonomy version - should make new request
        conf.params.iabContentTaxonomyVersion = "3.0";
        neuwo.getBidRequestData(bidsConfig3, () => {}, conf, "consent data");
        expect(server.requests.length, "Different taxonomy version should make new request").to.equal(2);
        expect(server.requests[1].url).to.contain("iabVersions=7"); // segtax 7 = taxonomy 3.0
      });

      it("should evict the oldest cache entry when MAX_CACHE_ENTRIES is exceeded", async function () {
        const apiResponse = getNeuwoApiResponse();
        const conf = config();
        conf.params.enableCache = true;

        // Fill cache with 10 entries (MAX_CACHE_ENTRIES)
        for (let i = 0; i < 10; i++) {
          const bidsConfig = bidsConfiglike();
          conf.params.websiteToAnalyseUrl = "https://publisher.works/page-" + i;
          neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
          server.requests[i].respond(
            200,
            { "Content-Type": "application/json; encoding=UTF-8" },
            JSON.stringify(apiResponse)
          );
        }
        // Flush microtasks so pendingRequests are cleaned up via .finally() handlers
        await Promise.resolve();

        expect(server.requests.length, "Should have made 10 API requests").to.equal(10);

        // Verify page-0 is cached
        const bidsConfigCached = bidsConfiglike();
        conf.params.websiteToAnalyseUrl = "https://publisher.works/page-0";
        neuwo.getBidRequestData(bidsConfigCached, () => {}, conf, "consent data");
        expect(server.requests.length, "page-0 should be served from cache").to.equal(10);

        // Add 11th entry to trigger eviction of the oldest (page-0)
        const bidsConfig11 = bidsConfiglike();
        conf.params.websiteToAnalyseUrl = "https://publisher.works/page-10";
        neuwo.getBidRequestData(bidsConfig11, () => {}, conf, "consent data");
        expect(server.requests.length, "page-10 should trigger new request").to.equal(11);
        server.requests[10].respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify(apiResponse)
        );
        await Promise.resolve();

        // page-0 should have been evicted and require a new request
        const bidsConfigEvicted = bidsConfiglike();
        conf.params.websiteToAnalyseUrl = "https://publisher.works/page-0";
        neuwo.getBidRequestData(bidsConfigEvicted, () => {}, conf, "consent data");
        expect(server.requests.length, "page-0 should be evicted and trigger new request").to.equal(12);

        // page-1 should still be cached
        const bidsConfigStillCached = bidsConfiglike();
        conf.params.websiteToAnalyseUrl = "https://publisher.works/page-1";
        neuwo.getBidRequestData(bidsConfigStillCached, () => {}, conf, "consent data");
        expect(server.requests.length, "page-1 should still be in cache").to.equal(12);
      });
    });

    describe("when enableCache is false", function () {
      it("should not cache the API response and make a new request each time", function () {
        const apiResponse = getNeuwoApiResponse();
        const bidsConfig1 = bidsConfiglike();
        const bidsConfig2 = bidsConfiglike();
        const conf = config();
        conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=3";
        conf.params.enableCache = false;

        // First call should make an API request
        neuwo.getBidRequestData(bidsConfig1, () => {}, conf, "consent data");
        expect(server.requests.length, "First call should make an API request").to.equal(1);

        const request1 = server.requests[0];
        request1.respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify(apiResponse)
        );

        // Second call should make a new API request (not use cache)
        neuwo.getBidRequestData(bidsConfig2, () => {}, conf, "consent data");
        expect(server.requests.length, "Second call should make a new API request").to.equal(2);

        const request2 = server.requests[1];
        request2.respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify(apiResponse)
        );

        // Both configs should have the same data structure
        const contentData1 = bidsConfig1.ortb2Fragments.global.site.content.data[0];
        const contentData2 = bidsConfig2.ortb2Fragments.global.site.content.data[0];
        expect(contentData1, "First config should have Neuwo data").to.exist;
        expect(contentData2, "Second config should have Neuwo data from new request").to.exist;
        expect(contentData1.name, "First config should have correct provider").to.equal(neuwo.DATA_PROVIDER);
        expect(contentData2.name, "Second config should have correct provider").to.equal(neuwo.DATA_PROVIDER);
      });

      it("should bypass existing cache when enableCache is false", function () {
        const apiResponse = getNeuwoApiResponse();
        const bidsConfig1 = bidsConfiglike();
        const bidsConfig2 = bidsConfiglike();
        const bidsConfig3 = bidsConfiglike();
        const conf = config();
        conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=4";

        // First call with caching enabled (default)
        neuwo.getBidRequestData(bidsConfig1, () => {}, conf, "consent data");
        expect(server.requests.length, "First call should make an API request").to.equal(1);

        const request1 = server.requests[0];
        request1.respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify(apiResponse)
        );

        // Second call with caching enabled should use cache
        neuwo.getBidRequestData(bidsConfig2, () => {}, conf, "consent data");
        expect(server.requests.length, "Second call should use cache").to.equal(1);

        // Third call with caching disabled should bypass cache
        conf.params.enableCache = false;
        neuwo.getBidRequestData(bidsConfig3, () => {}, conf, "consent data");
        expect(server.requests.length, "Third call should bypass cache and make new request").to.equal(2);

        const request2 = server.requests[1];
        request2.respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify(apiResponse)
        );
      });

      it("should clear pending request after error response and retry on next call", function (done) {
        const bidsConfig1 = bidsConfiglike();
        const bidsConfig2 = bidsConfiglike();
        const conf = config();
        conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=error-test";
        conf.params.enableCache = true;

        // First call - will get 404 error
        neuwo.getBidRequestData(bidsConfig1, () => {
          // After error, data should not be injected
          const contentData = bidsConfig1.ortb2Fragments.global?.site?.content?.data;
          expect(contentData, "No data should be injected after error").to.be.undefined;

          // Second call - should retry API (pending should be cleared)
          neuwo.getBidRequestData(bidsConfig2, () => {
            try {
              expect(server.requests.length, "Second call should retry after error").to.equal(2);
              const contentData2 = bidsConfig2.ortb2Fragments.global?.site?.content?.data?.[0];
              expect(contentData2, "Second call should have Neuwo data after retry").to.exist;
              expect(contentData2.name, "Second call should have correct provider").to.equal(neuwo.DATA_PROVIDER);
              done();
            } catch (e) {
              done(e);
            }
          }, conf, "consent data");

          // Respond with success to second request
          const request2 = server.requests[1];
          request2.respond(
            200,
            { "Content-Type": "application/json; encoding=UTF-8" },
            JSON.stringify(getNeuwoApiResponse())
          );
        }, conf, "consent data");

        expect(server.requests.length, "First call should make an API request").to.equal(1);

        // Respond with error to first request
        const request1 = server.requests[0];
        request1.respond(
          404,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify({ error: "Not found" })
        );
      });

      it("should handle concurrent requests when API returns error", function (done) {
        const bidsConfig1 = bidsConfiglike();
        const bidsConfig2 = bidsConfiglike();
        const bidsConfig3 = bidsConfiglike();
        const conf = config();
        conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=concurrent-error";
        conf.params.enableCache = true;

        let callbackCount = 0;
        const callback = () => {
          callbackCount++;
          if (callbackCount === 3) {
            try {
              // None of the configs should have data after error
              const contentData1 = bidsConfig1.ortb2Fragments.global?.site?.content?.data;
              const contentData2 = bidsConfig2.ortb2Fragments.global?.site?.content?.data;
              const contentData3 = bidsConfig3.ortb2Fragments.global?.site?.content?.data;

              expect(contentData1, "First config should not have data after error").to.be.undefined;
              expect(contentData2, "Second config should not have data after error").to.be.undefined;
              expect(contentData3, "Third config should not have data after error").to.be.undefined;
              done();
            } catch (e) {
              done(e);
            }
          }
        };

        // Make three concurrent calls
        neuwo.getBidRequestData(bidsConfig1, callback, conf, "consent data");
        neuwo.getBidRequestData(bidsConfig2, callback, conf, "consent data");
        neuwo.getBidRequestData(bidsConfig3, callback, conf, "consent data");

        expect(server.requests.length, "Only one API request should be made").to.equal(1);

        // Respond with error
        const request = server.requests[0];
        request.respond(
          500,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify({ error: "Internal server error" })
        );
      });

      it("should handle JSON parsing error in success callback", function (done) {
        const bidsConfig = bidsConfiglike();
        const conf = config();
        conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=parse-error";
        conf.params.enableCache = true;

        neuwo.getBidRequestData(bidsConfig, () => {
          // Callback should still be called
          const contentData = bidsConfig.ortb2Fragments.global?.site?.content?.data;
          expect(contentData, "No data should be injected after parsing error").to.be.undefined;
          done();
        }, conf, "consent data");

        expect(server.requests.length, "Should make an API request").to.equal(1);

        // Respond with invalid JSON
        const request = server.requests[0];
        request.respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          "{ invalid json content }"
        );
      });

      it("should not cache response after JSON parsing error and allow retry", function (done) {
        const bidsConfig1 = bidsConfiglike();
        const bidsConfig2 = bidsConfiglike();
        const conf = config();
        conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=parse-error-retry";
        conf.params.enableCache = true;

        neuwo.getBidRequestData(bidsConfig1, () => {
          // First call with parsing error
          const contentData1 = bidsConfig1.ortb2Fragments.global?.site?.content?.data;
          expect(contentData1, "No data after parsing error").to.be.undefined;

          // Second call should retry (not use cached error)
          neuwo.getBidRequestData(bidsConfig2, () => {
            try {
              expect(server.requests.length, "Should retry after parsing error").to.equal(2);
              const contentData2 = bidsConfig2.ortb2Fragments.global?.site?.content?.data?.[0];
              expect(contentData2, "Second call should have valid data").to.exist;
              expect(contentData2.name, "Should have correct provider").to.equal(neuwo.DATA_PROVIDER);
              done();
            } catch (e) {
              done(e);
            }
          }, conf, "consent data");

          // Second request gets valid response
          const request2 = server.requests[1];
          request2.respond(
            200,
            { "Content-Type": "application/json; encoding=UTF-8" },
            JSON.stringify(getNeuwoApiResponse())
          );
        }, conf, "consent data");

        // First request gets invalid JSON
        const request1 = server.requests[0];
        request1.respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          "{ this is not valid JSON }"
        );
      });

      it("should handle response with empty segments", function (done) {
        const bidsConfig = bidsConfiglike();
        const conf = config();
        conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?id=no-categories";

        neuwo.getBidRequestData(bidsConfig, () => {
          // Callback should still be called even with empty response
          const contentData = bidsConfig.ortb2Fragments.global?.site?.content?.data;
          expect(contentData, "No data should be injected without segments").to.be.undefined;
          done();
        }, conf, "consent data");

        const request = server.requests[0];
        request.respond(
          200,
          { "Content-Type": "application/json; encoding=UTF-8" },
          JSON.stringify({ "6": {}, "4": {} }) // Empty segments
        );
      });
    });

    describe("with URL query param stripping", function () {
      describe("when stripAllQueryParams is enabled", function () {
        it("should strip all query parameters from the analyzed URL", function () {
          const bidsConfig = bidsConfiglike();
          const conf = config();
          conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?utm_source=test&utm_campaign=example&id=5";
          conf.params.stripAllQueryParams = true;

          neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
          const request = server.requests[0];

          expect(request.url, "The request URL should not contain encoded query params").to.include(
            encodeURIComponent("https://publisher.works/article.php")
          );
          expect(request.url, "The request URL should not contain utm_source").to.not.include(
            encodeURIComponent("utm_source")
          );
        });
      });

      describe("when stripQueryParamsForDomains is enabled", function () {
        it("should strip query params only for matching domains", function () {
          const bidsConfig = bidsConfiglike();
          const conf = config();
          conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?foo=bar&id=5";
          conf.params.stripQueryParamsForDomains = ["publisher.works"];

          neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
          const request = server.requests[0];

          expect(request.url, "The request URL should contain the URL without query params").to.include(
            encodeURIComponent("https://publisher.works/article.php")
          );
          expect(request.url, "The request URL should not contain the id param").to.not.include(
            encodeURIComponent("id=5")
          );
        });

        it("should not strip query params for non-matching domains", function () {
          const bidsConfig = bidsConfiglike();
          const conf = config();
          conf.params.websiteToAnalyseUrl = "https://other-domain.com/page?foo=bar&id=5";
          conf.params.stripQueryParamsForDomains = ["publisher.works"];

          neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
          const request = server.requests[0];

          expect(request.url, "The request URL should contain the full URL with query params").to.include(
            encodeURIComponent("https://other-domain.com/page?foo=bar&id=5")
          );
        });

        it("should handle subdomain matching correctly", function () {
          const bidsConfig = bidsConfiglike();
          const conf = config();
          conf.params.websiteToAnalyseUrl = "https://sub.publisher.works/page?tracking=123";
          conf.params.stripQueryParamsForDomains = ["publisher.works"];

          neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
          const request = server.requests[0];

          expect(request.url, "The request URL should strip params for subdomain").to.include(
            encodeURIComponent("https://sub.publisher.works/page")
          );
          expect(request.url, "The request URL should not contain tracking param").to.not.include(
            encodeURIComponent("tracking=123")
          );
        });
      });

      describe("when stripQueryParams is enabled", function () {
        it("should strip only specified query parameters", function () {
          const bidsConfig = bidsConfiglike();
          const conf = config();
          conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?utm_source=test&utm_campaign=example&id=5";
          conf.params.stripQueryParams = ["utm_source", "utm_campaign"];

          neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
          const request = server.requests[0];

          expect(request.url, "The request URL should contain the id param").to.include(
            encodeURIComponent("id=5")
          );
          expect(request.url, "The request URL should not contain utm_source").to.not.include(
            encodeURIComponent("utm_source")
          );
          expect(request.url, "The request URL should not contain utm_campaign").to.not.include(
            encodeURIComponent("utm_campaign")
          );
        });

        it("should handle stripping params that result in no query string", function () {
          const bidsConfig = bidsConfiglike();
          const conf = config();
          conf.params.websiteToAnalyseUrl = "https://publisher.works/article.php?utm_source=test";
          conf.params.stripQueryParams = ["utm_source"];

          neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
          const request = server.requests[0];

          expect(request.url, "The request URL should not contain a query string").to.include(
            encodeURIComponent("https://publisher.works/article.php")
          );
          expect(request.url, "The request URL should not contain utm_source").to.not.include(
            encodeURIComponent("utm_source")
          );
        });

        it("should leave URL unchanged if specified params do not exist", function () {
          const bidsConfig = bidsConfiglike();
          const conf = config();
          const originalUrl = "https://publisher.works/article.php?id=5";
          conf.params.websiteToAnalyseUrl = originalUrl;
          conf.params.stripQueryParams = ["utm_source", "nonexistent"];

          neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
          const request = server.requests[0];

          expect(request.url, "The request URL should contain the original URL").to.include(
            encodeURIComponent(originalUrl)
          );
        });
      });

      describe("when no stripping options are provided", function () {
        it("should send the URL with all query parameters intact", function () {
          const bidsConfig = bidsConfiglike();
          const conf = config();
          const originalUrl = "https://publisher.works/article.php?get=horrible_url_for_testing&id=5";
          conf.params.websiteToAnalyseUrl = originalUrl;

          neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
          const request = server.requests[0];

          expect(request.url, "The request URL should contain the full original URL").to.include(
            encodeURIComponent(originalUrl)
          );
        });
      });
    });
  });

  describe("enrichment share", function () {
    let randomStub;
    let paramStub;
    let logWarnStub;

    beforeEach(function () {
      randomStub = sinon.stub(Math, "random").returns(0.5);
      paramStub = sinon.stub(utils, "getParameterByName").returns("");
      logWarnStub = sinon.stub(utils, "logWarn");
    });

    afterEach(function () {
      randomStub.restore();
      paramStub.restore();
      logWarnStub.restore();
      neuwo.neuwoRtdModule.init(config());
    });

    function shareConfig(settings) {
      const conf = config();
      conf.params.websiteToAnalyseUrl = "https://publisher.works/enrichment-share";
      if (settings !== undefined) {
        conf.params.enrichmentShareSettings = settings;
      }
      return conf;
    }

    function groupFor(settings) {
      expect(neuwo.neuwoRtdModule.init(shareConfig(settings)), "init should succeed").to.be.true;
      const targeting = neuwo.neuwoRtdModule.getTargetingData(["div-1"]);
      return targeting["div-1"] ? targeting["div-1"].neuwo_rtd_group : null;
    }

    it("should send no group when the settings are absent", function () {
      expect(groupFor(undefined)).to.equal(null);
    });

    it("should send no group when enabled is false", function () {
      expect(groupFor({ enabled: false, enrichmentRatio: 0.9 })).to.equal(null);
    });

    it("should send no group when enabled is not the boolean true", function () {
      expect(groupFor({ enabled: "true" })).to.equal(null);
    });

    it("should put the page load in the enriched group when the random draw is below the ratio", function () {
      randomStub.returns(0.89);
      expect(groupFor({ enabled: true, enrichmentRatio: 0.9 })).to.equal("enriched");
    });

    it("should put the page load in the baseline group when the random draw equals the ratio", function () {
      randomStub.returns(0.9);
      expect(groupFor({ enabled: true, enrichmentRatio: 0.9 })).to.equal("baseline");
    });

    it("should return the group for every ad unit code", function () {
      randomStub.returns(0.1);
      neuwo.neuwoRtdModule.init(shareConfig({ enabled: true }));

      expect(neuwo.neuwoRtdModule.getTargetingData(["div-1", "div-2"])).to.deep.equal({
        "div-1": { neuwo_rtd_group: "enriched" },
        "div-2": { neuwo_rtd_group: "enriched" },
      });
      expect(neuwo.neuwoRtdModule.getTargetingData([]), "no codes give no targeting").to.deep.equal({});
    });

    it("should use 0.9 without a warning when enrichmentRatio is absent", function () {
      randomStub.returns(0.89);
      expect(groupFor({ enabled: true })).to.equal("enriched");
      randomStub.returns(0.9);
      expect(groupFor({ enabled: true })).to.equal("baseline");
      expect(logWarnStub.called, "should not warn").to.be.false;
    });

    [
      { label: 'the string "0.5"', value: "0.5" },
      { label: "NaN", value: NaN },
      { label: "-0.1", value: -0.1 },
      { label: "1.1", value: 1.1 },
    ].forEach(({ label, value }) => {
      it(`should warn and use 0.9 when enrichmentRatio is ${label}`, function () {
        randomStub.returns(0.89);
        expect(groupFor({ enabled: true, enrichmentRatio: value })).to.equal("enriched");
        randomStub.returns(0.95);
        expect(groupFor({ enabled: true, enrichmentRatio: value })).to.equal("baseline");
        expect(logWarnStub.calledTwice, "should warn on each draw").to.be.true;
        expect(logWarnStub.firstCall.args[2]).to.match(/enrichmentRatio must be a number from 0 to 1/);
      });
    });

    it("should put every page load in the baseline group when enrichmentRatio is 0", function () {
      randomStub.returns(0);
      expect(groupFor({ enabled: true, enrichmentRatio: 0 })).to.equal("baseline");
    });

    it("should put every page load in the enriched group when enrichmentRatio is 1", function () {
      randomStub.returns(0.9999);
      expect(groupFor({ enabled: true, enrichmentRatio: 1 })).to.equal("enriched");
    });

    it("should clear the group when init runs again with the feature off", function () {
      randomStub.returns(0.1);
      expect(groupFor({ enabled: true })).to.equal("enriched");
      expect(groupFor(undefined)).to.equal(null);
    });

    it("should keep the group when init fails", function () {
      randomStub.returns(0.1);
      expect(groupFor({ enabled: true })).to.equal("enriched");
      randomStub.returns(0.95);
      const noToken = shareConfig({ enabled: true });
      delete noToken.params.neuwoApiToken;

      expect(neuwo.neuwoRtdModule.init(noToken), "init should fail").to.be.false;
      expect(neuwo.neuwoRtdModule.getTargetingData(["div-1"])).to.deep.equal({
        "div-1": { neuwo_rtd_group: "enriched" },
      });
    });

    it("should call the API as before when the settings are absent", function () {
      const conf = shareConfig(undefined);
      expect(neuwo.neuwoRtdModule.init(conf)).to.be.true;

      neuwo.getBidRequestData(bidsConfiglike(), () => {}, conf, "consent data");

      expect(server.requests.length, "should call the Neuwo API").to.equal(1);
    });

    it("should skip the API call and inject nothing in the baseline group", function () {
      randomStub.returns(0.95);
      const conf = shareConfig({ enabled: true });
      expect(neuwo.neuwoRtdModule.init(conf)).to.be.true;
      const bidsConfig = bidsConfiglike();
      const callback = sinon.spy();

      neuwo.getBidRequestData(bidsConfig, callback, conf, "consent data");

      expect(server.requests.length, "should not call the Neuwo API").to.equal(0);
      expect(bidsConfig.ortb2Fragments.global, "should inject nothing").to.deep.equal({});
      expect(callback.calledOnce, "should continue the auction once").to.be.true;
    });

    it("should keep the baseline group across auctions on the same page load", function () {
      randomStub.returns(0.95);
      const conf = shareConfig({ enabled: true });
      neuwo.neuwoRtdModule.init(conf);
      randomStub.returns(0.1);

      neuwo.getBidRequestData(bidsConfiglike(), () => {}, conf, "consent data");
      neuwo.getBidRequestData(bidsConfiglike(), () => {}, conf, "consent data");

      expect(server.requests.length, "no auction should call the Neuwo API").to.equal(0);
      expect(neuwo.neuwoRtdModule.getTargetingData(["div-1"])["div-1"].neuwo_rtd_group).to.equal("baseline");
    });

    it("should make no API call when enrichmentRatio is 0", function () {
      randomStub.returns(0);
      const conf = shareConfig({ enabled: true, enrichmentRatio: 0 });
      neuwo.neuwoRtdModule.init(conf);

      neuwo.getBidRequestData(bidsConfiglike(), () => {}, conf, "consent data");

      expect(server.requests.length, "should not call the Neuwo API").to.equal(0);
    });

    it("should still report the enriched group when the API call fails", function (done) {
      randomStub.returns(0.1);
      const conf = shareConfig({ enabled: true });
      neuwo.neuwoRtdModule.init(conf);

      neuwo.getBidRequestData(bidsConfiglike(), () => {
        expect(neuwo.neuwoRtdModule.getTargetingData(["div-1"])["div-1"].neuwo_rtd_group).to.equal("enriched");
        done();
      }, conf, "consent data");

      server.requests[0].respond(500, {}, "Server error");
    });

    it("should never put the group where bidders can see it", function () {
      randomStub.returns(0.1);
      const conf = shareConfig({ enabled: true });
      neuwo.neuwoRtdModule.init(conf);
      const bidsConfig = {
        adUnits: [{ code: "div-1", ortb2Imp: {} }],
        ortb2Fragments: { global: {}, bidder: {} },
      };

      neuwo.getBidRequestData(bidsConfig, () => {}, conf, "consent data");
      server.requests[0].respond(
        200,
        { "Content-Type": "application/json; encoding=UTF-8" },
        JSON.stringify(getNeuwoApiResponse())
      );

      expect(bidsConfig.ortb2Fragments.global.site.content.data[0].name, "should still enrich").to.equal(
        neuwo.DATA_PROVIDER
      );
      expect(JSON.stringify(bidsConfig), "should not contain the group key").to.not.include("neuwo_rtd_group");
    });

    it("should ignore a neuwo_rtd_group URL parameter", function () {
      paramStub.withArgs("neuwo_rtd_group").returns("baseline");
      randomStub.returns(0.1);
      expect(groupFor({ enabled: true })).to.equal("enriched");
    });
  });
});
