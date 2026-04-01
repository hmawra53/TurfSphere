// src/routes/bookings.js
const express = require('express');
const { Booking, Turf, SlotLock, Coupon } = require('../db');
const { requireAuth, requireOwner, requireAdmin } = require('../middleware/auth');
const router = express.Router();

function calcDuration(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) throw new Error('End time must be after start time');
  return Math.round((diff / 60) * 10) / 10;
}

// GET /api/bookings/slots
router.get('/slots', async (req, res) => {
  try {
    const { turf_id, date } = req.query;
    if (!turf_id || !date) return res.status(400).json({ error: 'turf_id and date required' });
    const slots = await Booking.find({ turf_id, date, status: { $ne: 'cancelled' } })
      .select('start_time end_time status');
    res.json(slots);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/bookings/lock
router.post('/lock', requireAuth, async (req, res) => {
  try {
    const { turf_id, date, start_time, end_time } = req.body;
    if (!turf_id || !date || !start_time || !end_time)
      return res.status(400).json({ error: 'turf_id, date, start_time, end_time required' });

    const conflict = await Booking.findOne({
      turf_id, date,
      status: { $ne: 'cancelled' },
      end_time:   { $gt: start_time },
      start_time: { $lt: end_time },
    });
    if (conflict) return res.status(409).json({ error: 'Slot already booked' });

    const now = Date.now();
    const existingLock = await SlotLock.findOne({
      turf_id, date, status: 'locked',
      end_time:   { $gt: start_time },
      start_time: { $lt: end_time },
      expires_at: { $gt: now },
    });
    if (existingLock && String(existingLock.user_id) !== String(req.user.id))
      return res.status(409).json({ error: 'Slot is being held by another user' });

    await SlotLock.deleteMany({ user_id: req.user.id, turf_id, date });
    const expiresAt = now + 15 * 60 * 1000;
    await SlotLock.create({ turf_id, user_id: req.user.id, date, start_time, end_time, expires_at: expiresAt, status: 'locked' });
    res.json({ message: 'Slot locked for 15 minutes', expires_at: expiresAt });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/bookings/lock
router.delete('/lock', requireAuth, async (req, res) => {
  try {
    const { turf_id, date } = req.body;
    await SlotLock.deleteMany({ user_id: req.user.id, turf_id, date });
    res.json({ message: 'Lock released' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/bookings/validate-coupon
router.post('/validate-coupon', requireAuth, async (req, res) => {
  try {
    const { code, amount } = req.body;
    if (!code) return res.status(400).json({ error: 'Coupon code required' });
    // Fetch by code only — check is_active in JS to avoid BSON type mismatch (Number 1 vs Boolean true)
    const coupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (!coupon || !coupon.is_active) return res.status(404).json({ error: 'Invalid or expired coupon' });
    if (coupon.uses_left <= 0) return res.status(400).json({ error: 'Coupon usage limit reached' });
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date())
      return res.status(400).json({ error: 'Coupon has expired' });
    // Only enforce min_booking if amount is a real total (>0), skip if frontend passed 0/null
    const bookingAmount = parseFloat(amount || 0);
    if (bookingAmount > 0 && bookingAmount < coupon.min_booking)
      return res.status(400).json({ error: `Minimum booking amount ₹${coupon.min_booking} required` });
    const discount = Math.round(bookingAmount * coupon.discount_pct / 100);
    res.json({ valid: true, discount_pct: coupon.discount_pct, discount_amount: discount, coupon });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/bookings
router.post('/', requireAuth, async (req, res) => {
  try {
    const { turf_id, contact_name, phone, date, start_time, end_time, players, coupon_code } = req.body;
    if (!turf_id || !contact_name || !phone || !date || !start_time || !end_time || !players)
      return res.status(400).json({ error: 'turf_id, contact_name, phone, date, start_time, end_time, players required' });

    const turf = await Turf.findOne({ _id: turf_id, status: 'approved' });
    if (!turf) return res.status(404).json({ error: 'Turf not found or not approved' });

    const conflict = await Booking.findOne({
      turf_id, date,
      status: { $ne: 'cancelled' },
      end_time:   { $gt: start_time },
      start_time: { $lt: end_time },
    });
    if (conflict) return res.status(409).json({ error: 'This time slot is already booked. Please choose another time.' });

    let duration;
    try { duration = calcDuration(start_time, end_time); }
    catch (e) { return res.status(400).json({ error: e.message }); }

    let total    = Math.round(turf.price * duration * 100) / 100;
    let discount = 0;

    if (coupon_code) {
      // Fetch by code only — check is_active in JS to avoid BSON type mismatch
      const coupon = await Coupon.findOne({ code: coupon_code.toUpperCase() });
      if (coupon && coupon.is_active && coupon.uses_left > 0) {
        discount = Math.round(total * coupon.discount_pct / 100);
        await Coupon.findByIdAndUpdate(coupon._id, { $inc: { uses_left: -1 } });
      }
    }

    const booking = await Booking.create({
      turf_id, user_id: req.user.id, contact_name, phone, date,
      start_time, end_time, duration_hrs: duration,
      players: parseInt(players), total_price: total - discount,
      coupon_code: coupon_code || null, discount, status: 'pending',
    });

    const populated = await Booking.findById(booking._id).populate('turf_id','name location sport price');
    const b = populated.toObject();
    b.id           = b._id;
    b.turf_name    = b.turf_id?.name;
    b.location     = b.turf_id?.location;
    b.sport        = b.turf_id?.sport;
    b.hourly_price = b.turf_id?.price;

    res.status(201).json({ message: 'Booking created', booking: b });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/bookings/:id/confirm
router.post('/:id/confirm', requireAuth, async (req, res) => {
  try {
    const { payment_ref } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (String(booking.user_id) !== String(req.user.id) && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Access denied' });
    const updated = await Booking.findByIdAndUpdate(
      req.params.id,
      { status: 'confirmed', payment_ref: payment_ref || 'UPI_' + Date.now() },
      { new: true }
    );
    res.json({ message: 'Booking confirmed', booking: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/bookings/mine
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const bookings = await Booking.find({ user_id: req.user.id })
      .populate('turf_id','name location sport price image')
      .sort({ created_at: -1 });
    res.json(bookings.map(b => {
      const obj = b.toObject();
      obj.id           = obj._id;
      obj.turf_name    = obj.turf_id?.name;
      obj.location     = obj.turf_id?.location;
      obj.sport        = obj.turf_id?.sport;
      obj.hourly_price = obj.turf_id?.price;
      obj.image        = obj.turf_id?.image;
      return obj;
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/bookings/:id — cancel
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (String(booking.user_id) !== String(req.user.id) && req.user.role !== 'admin')
      return res.status(403).json({ error: 'You can only cancel your own bookings' });
    await Booking.findByIdAndUpdate(req.params.id, { status: 'cancelled' });
    res.json({ message: 'Booking cancelled' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/bookings/owner/all
router.get('/owner/all', requireOwner, async (req, res) => {
  try {
    const ownerTurfs = await Turf.find({ owner_id: req.user.id }).select('_id');
    const turfIds = ownerTurfs.map(t => t._id);
    const bookings = await Booking.find({ turf_id: { $in: turfIds } })
      .populate('turf_id','name location')
      .populate('user_id','name')
      .sort({ created_at: -1 });
    res.json(bookings.map(b => {
      const obj = b.toObject();
      obj.id        = obj._id;
      obj.turf_name = obj.turf_id?.name;
      obj.location  = obj.turf_id?.location;
      obj.user_name = obj.user_id?.name || null;
      return obj;
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/bookings/admin/all
router.get('/admin/all', requireAdmin, async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('turf_id','name location')
      .populate('user_id','name')
      .sort({ created_at: -1 })
      .limit(200);
    res.json(bookings.map(b => {
      const obj = b.toObject();
      obj.id        = obj._id;
      obj.turf_name = obj.turf_id?.name;
      obj.location  = obj.turf_id?.location;
      obj.user_name = obj.user_id?.name || null;
      return obj;
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
