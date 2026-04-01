// src/db.js — MongoDB via Mongoose
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/turfsphere';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  phone:      { type: String, required: true, unique: true },
  email:      { type: String, default: null },
  password:   { type: String, required: true },
  role:       { type: String, enum: ['user','owner','admin'], default: 'user' },
  status:     { type: String, enum: ['active','suspended'], default: 'active' },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

const turfSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  location:     { type: String, required: true },
  sport:        { type: String, required: true },
  price:        { type: Number, required: true },
  image:        { type: String, default: null },
  description:  { type: String, default: null },
  amenities:    { type: String, default: '[]' },
  rating:       { type: Number, default: 4.0 },
  rating_count: { type: Number, default: 0 },
  owner_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status:       { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  is_default:   { type: Number, default: 0 },
  reject_reason:{ type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

const bookingSchema = new mongoose.Schema({
  turf_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'Turf', required: true },
  user_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  contact_name: { type: String, required: true },
  phone:        { type: String, required: true },
  date:         { type: String, required: true },
  start_time:   { type: String, required: true },
  end_time:     { type: String, required: true },
  duration_hrs: { type: Number, default: 1 },
  players:      { type: Number, default: 1 },
  total_price:  { type: Number, default: 0 },
  coupon_code:  { type: String, default: null },
  discount:     { type: Number, default: 0 },
  status:       { type: String, enum: ['pending','confirmed','cancelled'], default: 'pending' },
  payment_ref:  { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

const ratingSchema = new mongoose.Schema({
  turf_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Turf', required: true },
  user_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stars:    { type: Number, required: true, min: 1, max: 5 },
  review:   { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });
ratingSchema.index({ turf_id: 1, user_id: 1 }, { unique: true });

const slotLockSchema = new mongoose.Schema({
  turf_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Turf', required: true },
  user_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:       { type: String, required: true },
  start_time: { type: String, required: true },
  end_time:   { type: String, required: true },
  expires_at: { type: Number, required: true },
  status:     { type: String, default: 'locked' },
});

const couponSchema = new mongoose.Schema({
  code:         { type: String, required: true, unique: true },
  discount_pct: { type: Number, default: 10 },
  min_booking:  { type: Number, default: 0 },
  is_active:    { type: Number, default: 1 },
  uses_left:    { type: Number, default: 100 },
  expires_at:   { type: String, default: null },
});

// ─── Models ───────────────────────────────────────────────────────────────────
const User     = mongoose.model('User',     userSchema);
const Turf     = mongoose.model('Turf',     turfSchema);
const Booking  = mongoose.model('Booking',  bookingSchema);
const Rating   = mongoose.model('Rating',   ratingSchema);
const SlotLock = mongoose.model('SlotLock', slotLockSchema);
const Coupon   = mongoose.model('Coupon',   couponSchema);

// ─── Seed defaults ────────────────────────────────────────────────────────────
async function seedDefaults() {
  const adminExists = await User.findOne({ role: 'admin' });
  if (!adminExists) {
    const hash = await bcrypt.hash('admin123', 10);
    await User.create({ name: 'Admin', phone: '0000000000', password: hash, role: 'admin' });
    console.log('✅  Default admin: phone=0000000000 password=admin123');
  }

  let owner = await User.findOne({ role: 'owner' });
  if (!owner) {
    const hash = await bcrypt.hash('owner123', 10);
    owner = await User.create({ name: 'Demo Owner', phone: '9999999999', password: hash, role: 'owner' });
    console.log('✅  Default owner: phone=9999999999 password=owner123');
  }

  // Migration: fix any coupons where is_active was stored as boolean true instead of Number 1
  await Coupon.updateMany({ is_active: true }, { $set: { is_active: 1 } });

  await Coupon.updateOne(
    { code: 'FIRST20' },
    { $setOnInsert: { code: 'FIRST20', discount_pct: 20, min_booking: 500, uses_left: 50, is_active: 1 } },
    { upsert: true }
  );
  await Coupon.updateOne(
    { code: 'SPORT10' },
    { $setOnInsert: { code: 'SPORT10', discount_pct: 10, min_booking: 0, uses_left: 100, is_active: 1 } },
    { upsert: true }
  );
  // Reset uses_left if a coupon has been exhausted (ensures demo coupons always work)
  await Coupon.updateMany(
    { code: { $in: ['FIRST20', 'SPORT10'] }, uses_left: { $lte: 0 } },
    { $set: { uses_left: 50, is_active: 1 } }
  );
  console.log('✅  Ensured demo coupons: FIRST20 (20% off, min ₹500), SPORT10 (10% off)');

  const defaultTurfs = await Turf.countDocuments({ is_default: 1 });
  if (defaultTurfs > 0) return;

  const turfs = [
    { name:'GreenField Arena',  location:'Bangalore',  sport:'Football',   price:800,  image:'https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=800', description:'Premium 5v5 football on FIFA-approved artificial grass. Floodlights, dugout, and changing rooms.', rating:4.5, amenities:'["Floodlights","Changing Rooms","Parking","Water Facility"]' },
    { name:'Cricket Hub',       location:'Delhi',      sport:'Cricket',    price:1200, image:'https://images.unsplash.com/photo-1593341646782-e0b495cff86d?w=800', description:'Fully enclosed box cricket arena with high-grade turf for day and night matches.', rating:4.2, amenities:'["Equipment Rental","Floodlights","Spectator Seating","Canteen"]' },
    { name:'AceZone Tennis',    location:'Hyderabad',  sport:'Tennis',     price:600,  image:'https://images.unsplash.com/photo-1595433707802-6b2626ef1c91?w=800', description:'Professional-grade synthetic tennis courts, well-lit for evening games.', rating:4.4, amenities:'["Pro Shop","Coaching Available","Parking","Water"]' },
    { name:'Hoop Dreams',       location:'Chennai',    sport:'Basketball', price:700,  image:'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800', description:'FIBA-dimension acrylic court with glass backboards. Perfect for tournaments.', rating:4.1, amenities:'["FIBA Standard","Glass Backboards","Spectator Seating","Water"]' },
    { name:'Goal Arena',        location:'Pune',       sport:'Football',   price:750,  image:'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=800', description:'Fast-paced 6v6 football cage with high nets ensuring no out-of-bounds play.', rating:4.0, amenities:'["Safety Net","Floodlights","Parking"]' },
    { name:'PowerPlay Turf',    location:'Kolkata',    sport:'Cricket',    price:1000, image:'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=800', description:'Spacious box cricket with bowling machines and premium shock-absorbent turf.', rating:4.6, amenities:'["Bowling Machine","Spectator Seating","Parking","Canteen"]' },
    { name:'Elite Sports Hub',  location:'Ahmedabad',  sport:'Football',   price:850,  image:'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=800', description:'Multi-sport arena with LED lighting, secure lockers, and a warm-up zone.', rating:4.2, amenities:'["LED Lighting","Lockers","Warm-up Zone","Parking"]' },
    { name:'Skyline Turf',      location:'Surat',      sport:'Football',   price:800,  image:'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800', description:'Rooftop football turf with stunning city view and strong safety netting.', rating:4.2, amenities:'["Rooftop View","Safety Netting","Cafeteria","Seating"]' },
  ];

  await Turf.insertMany(turfs.map(t => ({
    ...t,
    rating_count: Math.floor(Math.random() * 30 + 10),
    owner_id: owner._id,
    status: 'approved',
    is_default: 1,
  })));
  console.log('✅  Seeded 8 default turfs');
}

async function initDb() {
  await mongoose.connect(MONGO_URI);
  await seedDefaults();
  console.log('✅  MongoDB connected:', MONGO_URI);
}

module.exports = { initDb, User, Turf, Booking, Rating, SlotLock, Coupon };
