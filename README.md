# 🏟️ TurfSphere v3.0 — Enhanced Sports Turf Booking Platform

## ✨ New in v3 (vs v2)

### 🚀 New Pages & Features
| Feature | Description |
|---------|-------------|
| **Landing Page** | Beautiful public-facing hero page with stats, features, sports showcase & CTA |
| **Wishlist / Favourites** | Heart-tap to save turfs; dedicated Wishlist tab on home page (persisted in localStorage) |
| **Turf Compare** | Select up to 3 turfs → side-by-side table comparing price, rating, amenities, description |
| **Find Players** | Community board to post/browse player-wanted requests by sport, date, skill level |
| **Tournaments** | Browse local tournaments with prizes, registration, team sign-up flow |
| **Quick Rebook** | "Rebook" button on confirmed bookings for instant re-booking the same turf |
| **Loyalty Points** | Dashboard shows earned points (₹100 spent = 1 pt) + achievement badges |
| **Advanced Filters** | Sort by price/rating/reviews, max price slider, min rating filter + clear chip badges |
| **Grid / List Toggle** | Switch between card grid and compact list view on home page |
| **Nav shortcuts** | Players & Tournaments links always visible in the top nav |

### 🎨 UI Improvements
- Active filter chip badges on home page (click to remove individual filters)
- "Find Players" banner on home page
- Profile banner on user dashboard with initials avatar + loyalty points
- Achievement badges (First Booking, Regular Player, Sports Enthusiast, Reviewer)
- Quick Actions row on user dashboard (Browse, Players, Tournaments, Wishlist)
- Booking history filter by status (all / confirmed / pending / cancelled)
- Compare strip fixed at bottom when 2-3 turfs are selected
- Improved turf cards with wishlist heart overlay and compare button

---

## Features (All v2 features retained +)

### 👤 User (Player)
- Register / Login / Forgot Password
- Browse approved turfs with search + sport filters
- **Advanced filters**: sort, max price slider, min rating
- **Wishlist** – save favourite turfs
- **Compare** up to 3 turfs side by side
- View turf details with image carousel, amenities, reviews
- **Book with slot picker** — price auto-calculated
- Apply coupon codes (FIRST20 = 20% off, SPORT10 = 10% off)
- Cancel bookings · **Rebook** confirmed bookings
- Rate & review turfs after visiting
- Booking history with status filter
- **Loyalty Points** + Achievement Badges
- **Find Players** — post / browse player-wanted requests
- **Tournaments** — browse & register for local tournaments

### 🏟️ Turf Owner (unchanged from v2)
- Separate Owner registration & login
- Submit new turfs (pending admin approval)
- Edit / Delete own turfs
- View all bookings for their turfs
- Revenue stats dashboard

### ⚙️ Admin (unchanged from v2)
- Approve / Reject turfs with reason
- View all users — suspend / activate
- View all bookings platform-wide
- Create / Delete coupon codes
- Real-time stats

---

## Project Structure

```
turfsphere-v3/
├── backend/                    (unchanged from v2)
│   └── src/
│       ├── server.js
│       ├── db.js
│       ├── middleware/auth.js
│       └── routes/
│           ├── auth.js · turfs.js · bookings.js · admin.js
└── frontend/
    ├── css/style.css
    ├── js/app.js               (updated: nav links for Players & Tournaments)
    └── html/
        ├── index.html          (smart redirect: logged in → dashboard, else → landing)
        ├── landing.html        ★ NEW – public hero / marketing page
        ├── login.html
        ├── register.html
        ├── forgot-password.html
        ├── home.html           ★ ENHANCED – wishlist tab, filters, compare, list view
        ├── compare.html        ★ NEW – side-by-side turf comparison
        ├── find-players.html   ★ NEW – community player-wanted board
        ├── tournaments.html    ★ NEW – local tournament listings + registration
        ├── details.html
        ├── booking.html
        ├── payment.html
        ├── user-dashboard.html ★ ENHANCED – profile banner, loyalty pts, achievements
        ├── owner-dashboard.html
        └── admin-dashboard.html
```

---

## Setup & Run

```bash
cd backend
npm install
npm start         # or: npm run dev
```

Open: `http://localhost:3000/html/index.html`

---

## Default Credentials

| Role  | Phone        | Password   |
|-------|-------------|------------|
| Admin | 0000000000  | admin123   |
| Owner | 9999999999  | owner123   |
| User  | Register a new account |

## Demo Coupons
| Code    | Discount | Minimum |
|---------|----------|---------| 
| FIRST20 | 20%      | ₹500    |
| SPORT10 | 10%      | None    |
