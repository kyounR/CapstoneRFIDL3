# 🚌 RFID Fare Collection System - TODO

## 🚀 Active & Pending Tasks
- [ ] Add unit tests
- [ ] More detail for audit log when a travel pass is canceled (use actual flavor text instead of `had_passengers = false`)
- [ ] Granularity to CALTRANSCO management report *(Pending UAT & client feedback)*
- [ ] General UI pass for every tab (fix Travel Pass tab styling being larger than others)
- [ ] **(MAJOR)** Official government-compliant receipt implementation
- [ ] **(MAJOR)** Revise Remittance feature entirely and automate it (linked to Travel Pass)
- [ ] Fix boarding status page to be non-scrollable and resized accordingly
- [ ] Revise UI of the travel pass page
- [ ] **(MAJOR) (HARDWARE)** Add an LED to the RFID reader and a buzzer/beeper for auditory feedback

---

## 💬 To Be Discussed / Blocked
- [ ] Allow one cardholder to pay for non-cardholders if they are part of the same group
- [ ] Change "passenger" field in transaction history to be more representative (currently shows "cash" instead of name; just needs a rename)

---

## ✅ Completed

### Admin & Management
- [x] **(MAJOR)** Actual user-facing admin management page (replaced Django backend management)
- [x] Add an admin auditing log to track every change an admin does
- [x] Search function for entries in admin management
- [x] Audit log path added to quick actions
- [x] Make the reason clear in summary or audit log when top-up reversals happen
- [x] Add error message when top-up reversal button is clicked without a reason

### Cashier & Top-ups
- [x] Make the Daily Summary page clearer (fixed confusing "Total Top-ups: 50" text)
- [x] Allow cashier/admin to easily look up existing cards by typing a name
- [x] Remove fee settings from remittance (now handled in admin management)
- [x] Add a "status" to driver to opt-in to savings and/or trust fund fees
- [x] Cashier login rename on the login page

### Travel Pass & Boarding
- [x] **(MAJOR)** Add boarding status page to be viewed by the public
- [x] Clarify UI in travel pass to indicate passenger discount status clearly
- [x] Make Travel Pass departure time automatic (uses current time)
- [x] Revise travel pass to read from terminal/line instead of homebase only (allow route changes)
- [x] **(MAJOR)** Native web-app implementation of card scanning (replaced Python terminal script)
- [x] Add color circle to receipt function and link with boarding status monitor for vehicle identification
- [x] Add color circle to passenger-facing monitor
- [x] Warning message if multiple vehicles share the same driver
- [x] Recolor one of the boarding codes (removed yellow)
- [x] Rephrase current receipt implementation to "boarding slip"
- [x] Revise current index logic of boarding code color shape

### Public Feeds & Security
- [x] Add extra info to public-facing tap feed (show deductions, exclude current balance)
- [x] Tap Feed data granularity (added date and filter for full tap lists on specific dates)
- [x] Add a message on the login page telling users to contact the administrator if they forget their password