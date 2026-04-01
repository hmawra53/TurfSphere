// src/routes/turfs.js
const express = require('express');
const { Turf, Rating } = require('../db');
const { requireAuth, requireOwner, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Helper: serialise a Turf doc to match original SQLite shape (flat id, owner_name)
function serializeTurf(turf, ownerName) {
  const obj = turf.toObject ? turf.toObject() : { ...turf };
  obj.id         = obj._id;
  obj.owner_name = ownerName || (turf.owner_id?.name) || null;
  return obj;
}

// GET /api/turfs — public, only approved turfs
router.get('/', async (req, res) => {
  try {
    const { q, sport, city } = req.query;
    const filter = { status: 'approved' };
    if (sport) filter.sport = sport;
    if (q)    filter.$or = [{ name: new RegExp(q,'i') }, { location: new RegExp(q,'i') }];
    if (city) filter.location = new RegExp(city,'i');

    const turfs = await Turf.find(filter)
      .populate('owner_id','name')
      .sort({ is_default: -1, rating: -1, created_at: -1 });

    res.json(turfs.map(t => serializeTurf(t, t.owner_id?.name)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/turfs/owner/mine
router.get('/owner/mine', requireOwner, async (req, res) => {
  try {
    const turfs = await Turf.find({ owner_id: req.user.id })
      .populate('owner_id','name')
      .sort({ created_at: -1 });
    res.json(turfs.map(t => serializeTurf(t, t.owner_id?.name)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/turfs/admin/all
router.get('/admin/all', requireAdmin, async (req, res) => {
  try {
    const turfs = await Turf.find()
      .populate('owner_id','name')
      .sort({ status: 1, created_at: -1 });
    res.json(turfs.map(t => serializeTurf(t, t.owner_id?.name)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/turfs/:id
router.get('/:id', async (req, res) => {
  try {
    const turf = await Turf.findById(req.params.id).populate('owner_id','name');
    if (!turf) return res.status(404).json({ error: 'Turf not found' });
    res.json(serializeTurf(turf, turf.owner_id?.name));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/turfs — owner submits new turf
router.post('/', requireOwner, async (req, res) => {
  try {
    const { name, location, sport, price, image, description, amenities } = req.body;
    if (!name || !location || !sport || !price || !description)
      return res.status(400).json({ error: 'name, location, sport, price, description required' });

    const turf = await Turf.create({
      name, location, sport,
      price: parseFloat(price),
      image: image || 'https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=800',
      description,
      amenities: JSON.stringify(amenities || []),
      owner_id: req.user.id,
      status: req.user.role === 'admin' ? 'approved' : 'pending',
      is_default: 0,
    });
    res.status(201).json({ message: 'Turf submitted for admin approval', turf: serializeTurf(turf) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/turfs/:id — owner updates own turf
router.put('/:id', requireOwner, async (req, res) => {
  try {
    const turf = await Turf.findById(req.params.id);
    if (!turf) return res.status(404).json({ error: 'Turf not found' });
    if (String(turf.owner_id) !== String(req.user.id) && req.user.role !== 'admin')
      return res.status(403).json({ error: 'You can only edit your own turfs' });

    const { name, location, sport, price, image, description, amenities } = req.body;
    const updates = { status: 'pending' };
    if (name)        updates.name        = name;
    if (location)    updates.location    = location;
    if (sport)       updates.sport       = sport;
    if (price)       updates.price       = parseFloat(price);
    if (image)       updates.image       = image;
    if (description) updates.description = description;
    if (amenities)   updates.amenities   = JSON.stringify(amenities);

    const updated = await Turf.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ message: 'Turf updated, pending re-approval', turf: serializeTurf(updated) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/turfs/:id
router.delete('/:id', requireOwner, async (req, res) => {
  try {
    const turf = await Turf.findById(req.params.id);
    if (!turf) return res.status(404).json({ error: 'Turf not found' });
    if (turf.is_default) return res.status(403).json({ error: 'Default turfs cannot be deleted' });
    if (String(turf.owner_id) !== String(req.user.id) && req.user.role !== 'admin')
      return res.status(403).json({ error: 'You can only delete your own turfs' });
    await Turf.findByIdAndDelete(req.params.id);
    res.json({ message: 'Turf deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/turfs/:id/approve
router.post('/:id/approve', requireAdmin, async (req, res) => {
  try {
    const turf = await Turf.findById(req.params.id);
    if (!turf) return res.status(404).json({ error: 'Turf not found' });
    await Turf.findByIdAndUpdate(req.params.id, { status: 'approved', reject_reason: null });
    res.json({ message: 'Turf approved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/turfs/:id/reject
router.post('/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    const turf = await Turf.findById(req.params.id);
    if (!turf) return res.status(404).json({ error: 'Turf not found' });
    await Turf.findByIdAndUpdate(req.params.id, { status: 'rejected', reject_reason: reason || 'No reason given' });
    res.json({ message: 'Turf rejected' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/turfs/:id/rate
router.post('/:id/rate', requireAuth, async (req, res) => {
  try {
    const { stars, review } = req.body;
    if (!stars || stars < 1 || stars > 5)
      return res.status(400).json({ error: 'Stars must be 1–5' });
    const turf = await Turf.findById(req.params.id);
    if (!turf) return res.status(404).json({ error: 'Turf not found' });

    await Rating.findOneAndUpdate(
      { turf_id: req.params.id, user_id: req.user.id },
      { stars, review: review || null },
      { upsert: true, new: true }
    );

    const agg = await Rating.aggregate([
      { $match: { turf_id: turf._id } },
      { $group: { _id: null, avg: { $avg: '$stars' }, cnt: { $sum: 1 } } }
    ]);
    const newRating = Math.round((agg[0]?.avg || stars) * 10) / 10;
    await Turf.findByIdAndUpdate(req.params.id, { rating: newRating, rating_count: agg[0]?.cnt || 1 });
    res.json({ message: 'Rating saved', newRating, count: agg[0]?.cnt || 1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/turfs/:id/reviews
router.get('/:id/reviews', async (req, res) => {
  try {
    const reviews = await Rating.find({ turf_id: req.params.id })
      .populate('user_id','name')
      .sort({ created_at: -1 })
      .limit(20);
    res.json(reviews.map(r => ({
      stars: r.stars,
      review: r.review,
      created_at: r.created_at,
      user_name: r.user_id?.name || null,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
