# 💊 Dhiman Medicos – Online Pharmacy

A production-ready online ordering platform for **Dhiman Medicos, Binewal, Hoshiarpur, Punjab**.

Customers can browse medicines, add products to cart, choose store pickup or home delivery, upload prescriptions where required, and place orders through the online checkout.

## 🚀 Production

The application is deployed with:

- **Frontend / API:** Next.js
- **Hosting:** Vercel
- **Database:** Supabase PostgreSQL
- **Authentication:** Supabase Auth
- **Payments:** Razorpay / manual UPI depending on checkout flow
- **PWA:** Next PWA
- **Source control:** GitHub

Production:

`https://dhiman-medicos-online.vercel.app`

## 🛒 Online Ordering

The customer checkout supports:

### Store Pickup

- No delivery charge
- Pickup from Dhiman Medicos
- **Pay on pickup (COD)** supported
- UPI/online payment can also be offered

### Home Delivery

Home delivery is restricted to the configured delivery area.

Current rules:

- **Minimum order:** ₹199
- **Maximum delivery radius:** 2 km
- **GPS verification:** required
- **Payment:** UPI advance payment
- Delivery availability is verified server-side through Supabase

When the cart total is below ₹199, checkout displays a red warning:

> ⚠️ Minimum order for home delivery is ₹199. Add more items to continue.

The order button remains disabled until the minimum is reached.

## 📦 Order Flow

```text
Customer
   ↓
Browse Medicines
   ↓
Add to Cart
   ↓
Checkout
   ↓
Choose:
 ├── Store Pickup
 └── Home Delivery
        ↓
     GPS Check
        ↓
  Delivery Validation
        ↓
Payment Selection
        ↓
Place Order
        ↓
Supabase
        ↓
Customer Order
        ↓
Order Items
        ↓
Order Event / Tracking
        ↓
Admin / POS
