import express from 'express';
import { Record } from '../models/Record.js';

const router = express.Router();

// Simple aggregate by district (counts)
router.get('/by-district', async (req, res) => {
  const { scheme } = req.query;
  try {
    const match = {};
    if (scheme) match['scheme.name'] = scheme;
    const data = await Record.aggregate([
      { $match: match },
      { $group: { _id: '$location.district', count: { $sum: 1 }, state: { $first: '$location.state' } } },
      { $project: { district: '$_id', state: 1, count: 1, _id: 0 } },
      { $sort: { count: -1 } }
    ]);
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
