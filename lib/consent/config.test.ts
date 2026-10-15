import assert from "node:assert/strict";
import test from "node:test";
import { resolveGoogleTrackerActivation } from "./config";

const GA4 = "G-TEST123";
const ADS = "AW-123456789";

const configurations = [
  { name: "alleen GA4", gaMeasurementId: GA4, googleAdsId: null },
  { name: "alleen Google Ads", gaMeasurementId: null, googleAdsId: ADS },
  { name: "GA4 en Google Ads", gaMeasurementId: GA4, googleAdsId: ADS },
] as const;

const basicConsentChoices = [
  { name: "geen toestemming", statistics: false, marketing: false },
  { name: "alleen statistieken", statistics: true, marketing: false },
  { name: "alleen marketing", statistics: false, marketing: true },
] as const;

for (const config of configurations) {
  for (const consent of basicConsentChoices) {
    test(`${config.name} + ${consent.name}: iedere dienst volgt uitsluitend zijn eigen categorie`, () => {
      const result = resolveGoogleTrackerActivation(config, consent);
      const expectedGA4 = Boolean(config.gaMeasurementId && consent.statistics);
      const expectedAds = Boolean(config.googleAdsId && consent.marketing);

      assert.deepEqual(result, {
        initializeGA4: expectedGA4,
        initializeGoogleAds: expectedAds,
        loadGoogleTag: expectedGA4 || expectedAds,
      });
    });
  }

  test(`${config.name} + beide categorieën toegestaan: uitsluitend geconfigureerde diensten starten`, () => {
    const result = resolveGoogleTrackerActivation(config, {
      statistics: true,
      marketing: true,
    });
    assert.equal(result.initializeGA4, Boolean(config.gaMeasurementId));
    assert.equal(result.initializeGoogleAds, Boolean(config.googleAdsId));
    assert.equal(result.loadGoogleTag, true);
  });
}

test("zonder tracker-ID's blijft Google uit bij iedere toestemmingskeuze", () => {
  for (const consent of [
    { statistics: false, marketing: false },
    { statistics: true, marketing: false },
    { statistics: false, marketing: true },
    { statistics: true, marketing: true },
  ]) {
    assert.deepEqual(
      resolveGoogleTrackerActivation(
        { gaMeasurementId: null, googleAdsId: null },
        consent,
      ),
      {
        initializeGA4: false,
        initializeGoogleAds: false,
        loadGoogleTag: false,
      },
    );
  }
});

test("voorkeuren wijzigen en intrekken schakelt toekomstige diensten direct uit", () => {
  const config = { gaMeasurementId: GA4, googleAdsId: ADS };
  const sequence = [
    resolveGoogleTrackerActivation(config, { statistics: false, marketing: false }),
    resolveGoogleTrackerActivation(config, { statistics: true, marketing: false }),
    resolveGoogleTrackerActivation(config, { statistics: false, marketing: false }),
    resolveGoogleTrackerActivation(config, { statistics: false, marketing: true }),
    resolveGoogleTrackerActivation(config, { statistics: false, marketing: false }),
  ];

  assert.deepEqual(
    sequence.map(({ initializeGA4, initializeGoogleAds, loadGoogleTag }) => [
      initializeGA4,
      initializeGoogleAds,
      loadGoogleTag,
    ]),
    [
      [false, false, false],
      [true, false, true],
      [false, false, false],
      [false, true, true],
      [false, false, false],
    ],
  );
});
