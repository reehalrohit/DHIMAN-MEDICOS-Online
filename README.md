DHIMAN MEDICOS - MANUAL UPI PAYMENT PATCH

Payment flow:
- Home delivery: UPI advance payment only.
- Store pickup: Pay on pickup or UPI.
- Customer UPI VPA: dhimanmedicos@upi
- Order is created as payment_status=pending.
- Customer receives an Open UPI app link with the exact order amount.
- Pharmacy staff manually verifies the bank/UPI transaction.
- Staff clicks "Mark UPI payment received" in Admin > Online Store Orders.
- Order acceptance remains blocked until payment_status=paid.

Files included:
- app/online-order/page.js
- app/api/online-orders/route.js
- app/api/pos/online-orders/route.js
- app/admin/orders/page.js
- supabase/migrations/20260908_manual_upi_payment.sql

The Razorpay verification/webhook files are intentionally not deleted in this patch because they may be needed for historical Razorpay orders. They are no longer used by the customer checkout flow.
