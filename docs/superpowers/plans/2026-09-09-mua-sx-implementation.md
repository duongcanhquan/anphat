# Mua hàng + Sản xuất Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm Mua hàng (NCC, đơn 1 vật liệu, nhận/trả/chuyển số dư), Sản xuất (định mức %, trừ kho), sổ kỳ NCC/kho/theo dõi đơn; đơn bán không trừ kho.

**Architecture:** Logic thuần (`purchase.ts`, `production.ts`, `ledger.ts`) có unit test. Firestore collections `suppliers`, `purchaseOrders`, `productionOrders`. UI soi gương Sales/Warehouse. `stockEntries` dùng lại cho nhập/xuất.

**Tech Stack:** React 19, Vite, Firebase Firestore, Vitest, TypeScript.

## Global Constraints

- Một đơn mua = 1 NCC + 1 vật liệu; không VAT đơn mua
- `%` nhập 5.2 = 5,2% (÷ 100)
- Đá = (G − nhựa) × % × hệ số (mặc định 1,03, sửa được), tròn 4 số
- Nhựa/dầu/than = G × %, tròn 2 số; MC/nhũ gõ tay
- Chốt SX trừ kho; đơn bán không trừ kho
- Thành phẩm không nhập kho
- Admin ghi; Viewer xem; Superadmin xóa/huỷ lệnh đã chốt
- Không commit trừ khi user yêu cầu

---

### Task 1: Logic + test

**Files:**
- Create: `src/lib/purchase.ts`, `src/lib/production.ts`, `src/lib/ledger.ts`
- Test: `src/lib/purchase.test.ts`, `src/lib/production.test.ts`, `src/lib/ledger.test.ts`

**Produces:** `purchaseTotals`, `computeProduction`, `supplierPeriodLedger`, `stockPeriodRows`, `salesOrderTracking`

---

### Task 2: Types + store + rules

**Files:**
- Modify: `src/types/index.ts`, `src/lib/store.ts`, `firestore.rules`

---

### Task 3: Settings NCC + định mức SX trên sản phẩm

---

### Task 4: Trang Mua hàng

---

### Task 5: Trang Sản xuất + bỏ trừ kho bán

---

### Task 6: Tổng kết + menu
