// src/routes/auth.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { User } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'turfsphere_secret';

// In-memory OTP store (use Redis in production)
const otpStore = new Map();

// POST /api/auth/send-otp
router.post('/send-otp', (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.length < 10) return res.status(400).json({ error: 'Valid phone number required' });
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000;
  otpStore.set(phone, { otp, expiresAt, verified: false });
  console.log(`OTP for ${phone}: ${otp}`);
  res.json({ message: 'OTP sent successfully', demo_otp: otp });
});

// POST /api/auth/verify-otp
router.post('/verify-otp', (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP required' });
  const record = otpStore.get(phone);
  if (!record) return res.status(400).json({ error: 'No OTP sent for this number. Request a new one.' });
  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
  }
  if (record.otp !== otp.toString()) return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
  record.verified = true;
  otpStore.set(phone, record);
  res.json({ message: 'Phone verified successfully', verified: true });
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, phone, password, role = 'user', email } = req.body;
    if (!name || !phone || !password)
      return res.status(400).json({ error: 'Name, phone and password required' });
    if (!['user','owner'].includes(role))
      return res.status(400).json({ error: 'Role must be user or owner' });
    if (phone.length < 10)
      return res.status(400).json({ error: 'Enter a valid 10-digit phone number' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = await User.findOne({ phone });
    if (existing) return res.status(409).json({ error: 'Phone number already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, phone, email: email || null, password: hashed, role });
    res.status(201).json({ message: 'Registration successful', userId: user._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { phone, password, role } = req.body;
    if (!phone || !password)
      return res.status(400).json({ error: 'Phone and password required' });

    const user = await User.findOne({ phone });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'Invalid credentials' });

    if (user.status === 'suspended')
      return res.status(403).json({ error: 'Account suspended. Contact admin.' });

    if (role && user.role !== role)
      return res.status(403).json({ error: `This account is registered as "${user.role}", not "${role}"` });

    const token = jwt.sign(
      { id: user._id, name: user.name, phone: user.phone, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ message: 'Login successful', token, user: { id: user._id, name: user.name, phone: user.phone, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { phone, newPassword } = req.body;
    if (!phone || !newPassword)
      return res.status(400).json({ error: 'Phone and new password required' });
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ error: 'Phone number not found' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await User.updateOne({ phone }, { password: hashed });
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('name phone email role created_at');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
