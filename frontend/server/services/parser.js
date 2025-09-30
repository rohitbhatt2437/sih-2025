// Heuristic parser to map OCR raw text into structured Claim fields
// NOTE: This is a best-effort regex-based parser. Improve with templates or ML as needed.

/**
 * Extracts a value after any of the provided label synonyms.
 * @param {string} text
 * @param {string[]} labels e.g., ['Name', 'Applicant Name']
 */
function pickAfterLabel(text, labels) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const pattern = new RegExp(`^(?:${labels.map(l => l.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join('|')})\s*[:\-\=]?\s*(.+)$`, 'i');
  for (const line of lines) {
    const m = line.match(pattern);
    if (m && m[1]) return m[1].trim();
  }
  return '';
}

function detectFormType(text) {
  const t = text.toLowerCase();
  if (/form\s*c\b/.test(t) || /community resource claim/i.test(t)) return 'COMMUNITY_RESOURCE_CLAIM_C';
  if (/form\s*b\b/.test(t) || /community rights claim/i.test(t)) return 'COMMUNITY_RIGHTS_CLAIM_B';
  if (/form\s*a\b/.test(t) || /individual\s+claim/i.test(t)) return 'INDIVIDUAL_CLAIM_A';
  return null;
}

function normalizeGeoPoint(latStr, lonStr) {
  const lat = parseFloat(String(latStr).replace(/[^0-9.\-]/g, ''));
  const lon = parseFloat(String(lonStr).replace(/[^0-9.\-]/g, ''));
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return { type: 'Point', coordinates: [lon, lat] };
  }
  return undefined;
}

/**
 * Parse OCR raw text to our structured Claim fields.
 * @param {string} text
 * @returns {{ formType, location, claimantInfo, individualClaimDetails, communityInfo, communityClaimDetails, otherTraditionalRight }}
 */
export function parseClaimFromText(text) {
  const name = pickAfterLabel(text, ['Name', 'Applicant Name', 'Name of Claimant']);
  const spouseName = pickAfterLabel(text, ['Spouse Name', 'Husband Name', 'Wife Name']);
  const parentName = pickAfterLabel(text, ["Father's Name", 'Parent Name', 'Guardian Name']);
  const addressLine = pickAfterLabel(text, ['Address', 'Residential Address']);

  const state = pickAfterLabel(text, ['State', 'State/UT', 'State Name']);
  const district = pickAfterLabel(text, ['District']);
  const tehsilTaluka = pickAfterLabel(text, ['Tehsil', 'Taluka', 'Tehsil/Taluka']);
  const gramPanchayat = pickAfterLabel(text, ['Gram Panchayat', 'GP']);
  const villageGramSabha = pickAfterLabel(text, ['Village', 'Gram Sabha', 'Village/Gram Sabha']);

  // Optional geo coordinates if present as Lat: <..> Lon: <..>
  const geoMatch = text.match(/Lat(?:itude)?:\s*([0-9.+-]+).*?Lon(?:gitude)?:\s*([0-9.+-]+)/i);
  const geoLocation = geoMatch ? normalizeGeoPoint(geoMatch[1], geoMatch[2]) : undefined;

  const formType = detectFormType(text);

  // Minimal population; other fields left empty for manual verification later
  return {
    formType,
    location: { state, district, tehsilTaluka, gramPanchayat, villageGramSabha, geoLocation },
    claimantInfo: { name, spouseName, parentName, address: addressLine, type: null, stCertificateReference: '', familyMembers: [] },
    individualClaimDetails: {
      landForHabitation: '',
      landForCultivation: '',
      disputedLands: '',
      pattasLeasesGrants: '',
      inSituRehabilitation: '',
      displacedLand: '',
      forestVillageLand: '',
    },
    communityInfo: { type: null, membersListReference: '' },
    communityClaimDetails: {
      nistarRights: '',
      minorForestProduceRights: '',
      usesOrEntitlements: '',
      grazingRights: '',
      nomadicPastoralistAccess: '',
      ptgCommunityTenure: '',
      biodiversityAccessAndIP: '',
      mapReference: '',
      khasraCompartmentNo: '',
      borderingVillages: '',
    },
    otherTraditionalRight: '',
  };
}
