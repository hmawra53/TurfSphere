// src/routes/admin.js
const express = require('express');
const { User, Turf, Booking, Coupon } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/admin/stats
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [users, owners, approved, pending, rejected, bookings, revenueAgg] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'owner' }),
      Turf.countDocuments({ status: 'approved' }),
      Turf.countDocuments({ status: 'pending' }),
      Turf.countDocuments({ status: 'rejected' }),
      Booking.countDocuments({ status: 'confirmed' }),
      Booking.aggregate([
        { $match: { status: 'confirmed' } },
        { $group: { _id: null, total: { $sum: '$total_price' } } }
      ]),
    ]);
    const revenue = revenueAgg[0]?.total || 0;
    res.json({ users, owners, approved, pending, rejected, bookings, revenue });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select('name phone email role status created_at')
      .sort({ created_at: -1 });
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/users/:id/suspend
router.post('/users/:id/suspend', requireAdmin, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { status: 'suspended' });
    res.json({ message: 'User suspended' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/users/:id/activate
router.post('/users/:id/activate', requireAdmin, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { status: 'active' });
    res.json({ message: 'User activated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/coupons
router.get('/coupons', requireAdmin, async (req, res) => {
  try {
    res.json(await Coupon.find().sort({ _id: -1 }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/coupons
router.post('/coupons', requireAdmin, async (req, res) => {
  try {
    const { code, discount_pct, min_booking, uses_left, expires_at } = req.body;
    if (!code || !discount_pct) return res.status(400).json({ error: 'code and discount_pct required' });
    const exists = await Coupon.findOne({ code: code.toUpperCase() });
    if (exists) return res.status(409).json({ error: 'Coupon code already exists' });
    await Coupon.create({
      code: code.toUpperCase(),
      discount_pct: parseInt(discount_pct),
      min_booking: parseFloat(min_booking || 0),
      uses_left: parseInt(uses_left || 100),
      expires_at: expires_at || null,
    });
    res.status(201).json({ message: 'Coupon created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/admin/coupons/:id
router.delete('/coupons/:id', requireAdmin, async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ message: 'Coupon deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
