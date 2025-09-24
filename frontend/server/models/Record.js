import mongoose from 'mongoose';

const GeoSchema = new mongoose.Schema({
  lat: { type: Number, default: null },
  lon: { type: Number, default: null },
  geocode_confidence: { type: Number, default: null },
}, { _id: false });

const RecordSchema = new mongoose.Schema({
  document_id: String,
  participant: {
    name: String,
    gender: String,
    age: Number,
    phone: String,
    id_type: String,
    id_number: String,
  },
  scheme: {
    name: String,
    code: String,
  },
  location: {
    address_text: String,
    village: String,
    ward: String,
    tehsil: String,
    district: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' },
    geo: { type: GeoSchema, default: {} },
  },
  participation: {
    enrollment_date: String, // ISO
    status: { type: String, enum: ['Enrolled','Applied','Approved','Benefitted','Unknown'], default: 'Unknown' },
  },
  meta: {
    language: String,
    ocr_confidence: Number,
    source_filename: String,
    created_at: { type: Date, default: Date.now },
  },
}, { timestamps: true });

export const Record = mongoose.models.Record || mongoose.model('Record', RecordSchema);
