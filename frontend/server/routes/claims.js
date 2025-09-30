import express from 'express';
import mongoose from 'mongoose';
import { Claim } from '../models/Claim.js';

const router = express.Router();

// GET /api/claims/states?status=UNAPPROVED
router.get('/states', async (req, res) => {
  try {
    const status = req.query.status || 'UNAPPROVED';
    const data = await Claim.aggregate([
      { $match: { status } },
      { $group: { _id: '$location.state', count: { $sum: 1 } } },
      { $project: { state: '$_id', count: 1, _id: 0 } },
      { $sort: { state: 1 } },
    ]);
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/claims/districts?state=...&status=UNAPPROVED
router.get('/districts', async (req, res) => {
  try {
    const { state } = req.query;
    const status = req.query.status || 'UNAPPROVED';
    if (!state) return res.status(400).json({ error: 'state is required' });
    const data = await Claim.aggregate([
      { $match: { status, 'location.state': state } },
      { $group: { _id: '$location.district', count: { $sum: 1 } } },
      { $project: { district: '$_id', count: 1, _id: 0 } },
      { $sort: { district: 1 } },
    ]);
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/claims/villages?state=...&district=...&status=UNAPPROVED
router.get('/villages', async (req, res) => {
  try {
    const { state, district } = req.query;
    const status = req.query.status || 'UNAPPROVED';
    if (!state || !district) return res.status(400).json({ error: 'state and district are required' });
    const data = await Claim.aggregate([
      { $match: { status, 'location.state': state, 'location.district': district } },
      { $group: { _id: '$location.villageGramSabha', count: { $sum: 1 } } },
      { $project: { village: '$_id', count: 1, _id: 0 } },
      { $sort: { village: 1 } },
    ]);
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/claims/list?state=...&district=...&village=...&status=UNAPPROVED
router.get('/list', async (req, res) => {
  try {
    const { state, district, village } = req.query;
    const status = req.query.status || 'UNAPPROVED';
    const q = { status };
    if (state) q['location.state'] = state;
    if (district) q['location.district'] = district;
    if (village) q['location.villageGramSabha'] = village;
    const items = await Claim.find(q)
      .sort({ submissionDate: -1 })
      .limit(500)
      .lean();
    const data = items.map(d => ({
      id: d._id.toString(),
      formType: d.formType,
      status: d.status,
      name: d.claimantInfo?.name || '',
      appliedDate: d.submissionDate || d.createdAt,
      address: {
        state: d.location?.state || '',
        district: d.location?.district || '',
        tehsilTaluka: d.location?.tehsilTaluka || '',
        gramPanchayat: d.location?.gramPanchayat || '',
        village: d.location?.villageGramSabha || '',
        full: d.claimantInfo?.address || '',
      },
    }));
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/claims/:id  body: { status?, rejectionReason?, updates? }
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'invalid id' });

    const { status, rejectionReason, updates } = req.body || {};
    const $set = {};
    if (status) {
      $set.status = status;
      if (status === 'APPROVED') $set.approvalDate = new Date();
      if (status === 'REJECTED') $set.rejectionReason = rejectionReason || '';
    }
    if (updates && typeof updates === 'object') {
      // shallow merge supported fields
      for (const [k, v] of Object.entries(updates)) {
        $set[k] = v;
      }
    }
    const doc = await Claim.findByIdAndUpdate(id, { $set }, { new: true });
    res.json({ ok: true, data: { id: doc?._id?.toString() } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
