import mongoose from 'mongoose';

const GeoPointSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: { type: [Number], default: [0, 0] }, // [lon, lat]
}, { _id: false });

const OcrMetadataSchema = new mongoose.Schema({
  sourceFile: { type: String, default: null },
  confidenceScore: { type: Number, default: null },
  processedAt: { type: Date, default: Date.now },
}, { _id: false });

const FamilyMemberSchema = new mongoose.Schema({
  name: String,
  age: Number,
}, { _id: false });

const ClaimSchema = new mongoose.Schema({
  // --- CORE FIELDS ---
  formType: { type: String, enum: ['Claim Form For Rights To Community Forest Resource', 'Title to Community Forest Rights', 'Title for forest land under occupation', 'title to community forest resources', 'claim form for rights to forest land', 'claim form for community rights'], default: null },
  status: { type: String, enum: ['UNAPPROVED', 'APPROVED', 'REJECTED'], default: 'UNAPPROVED' },
  ocrMetadata: { type: OcrMetadataSchema, default: {} },
  rawText: { type: String, default: '' },
  submissionDate: { type: Date, default: Date.now },
  approvalDate: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },

  // LOCATION
  location: {
    state: { type: String, default: '' },
    district: { type: String, default: '' },
    tehsilTaluka: { type: String, default: '' },
    gramPanchayat: { type: String, default: '' },
    villageGramSabha: { type: String, default: '' },
    geoLocation: { type: GeoPointSchema, default: undefined },
  },

  // INDIVIDUAL_CLAIM_A
  claimantInfo: {
    name: { type: String, default: '' },
    spouseName: { type: String, default: '' },
    parentName: { type: String, default: '' },
    address: { type: String, default: '' },
    type: { type: String, enum: ['ST', 'OTFD', null], default: null },
    stCertificateReference: { type: String, default: '' },
    familyMembers: { type: [FamilyMemberSchema], default: [] },
  },
  individualClaimDetails: {
    landForHabitation: { type: String, default: '' },
    landForCultivation: { type: String, default: '' },
    disputedLands: { type: String, default: '' },
    pattasLeasesGrants: { type: String, default: '' },
    inSituRehabilitation: { type: String, default: '' },
    displacedLand: { type: String, default: '' },
    forestVillageLand: { type: String, default: '' },
  },

  // COMMUNITY_* (B & C)
  communityInfo: {
    type: { type: String, enum: ['FDST_COMMUNITY', 'OTFD_COMMUNITY', null], default: null },
    membersListReference: { type: String, default: '' },
  },
  communityClaimDetails: {
    nistarRights: { type: String, default: '' },
    minorForestProduceRights: { type: String, default: '' },
    usesOrEntitlements: { type: String, default: '' },
    grazingRights: { type: String, default: '' },
    nomadicPastoralistAccess: { type: String, default: '' },
    ptgCommunityTenure: { type: String, default: '' },
    biodiversityAccessAndIP: { type: String, default: '' },
    mapReference: { type: String, default: '' },
    khasraCompartmentNo: { type: String, default: '' },
    borderingVillages: { type: String, default: '' },
  },

  otherTraditionalRight: { type: String, default: '' },

  // TITLE (populated upon approval)
  titleInfo: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export const Claim = mongoose.models.Claim || mongoose.model('Claim', ClaimSchema);
