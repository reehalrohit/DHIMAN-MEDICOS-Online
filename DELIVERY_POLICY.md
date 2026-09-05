# Dhiman Medicos delivery policy

- Home delivery: online Razorpay advance payment only.
- Home delivery minimum order: ₹199.
- Home delivery radius: 2 km from the store.
- Store pickup: Pay on pickup (COD) OR Razorpay.
- The server enforces all three rules.
- The customer's raw GPS coordinates are not stored; only the calculated distance is stored.

IMPORTANT:
The default store coordinate used by this patch is the Jhungian/Binewal area coordinate (31.2847197, 76.2614544). The public business listing confirms Dhiman Medicos is at Adda Jhungian, Binewal, Punjab 144523, but an exact storefront coordinate was not exposed by the sources checked. Replace the two coordinate constants with the exact Google Maps pin for the store before relying on the 2 km boundary.
