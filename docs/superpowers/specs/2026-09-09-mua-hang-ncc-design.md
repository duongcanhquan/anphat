# Mua hàng và công nợ nhà cung cấp

Ngày: 2026-09-09  
App: An Phát (Firestore + React)  
Trạng thái: chờ duyệt spec — chưa triển khai

## Mục tiêu

Theo dõi mua vật liệu theo nhà cung cấp: một đơn một vật liệu, nhận hàng nhập kho, trả tiền nhiều đợt, chuyển số dư sang đơn sau, và sổ công nợ (nợ đầu / nhập mua / trả tiền / nợ cuối).

## Ngoài phạm vi (không làm trong spec này)

- **Sản xuất** — spec riêng `2026-09-09-san-xuat-design.md`
- Đổi **Bán hàng** theo file sẽ gửi sau — giữ nguyên module hiện tại
- Nhiều dòng vật liệu trên một đơn mua
- VAT / chiết khấu trên đơn mua
- Chuyển phiếu nhập kho lẻ cũ (`contractor` text) thành nhà cung cấp

Bốn hạng mục hệ thống (định hướng lâu dài): Mua hàng · Bán hàng · Sản xuất · Kho. Spec này chỉ Mua hàng (+ tab sổ NCC trong Tổng kết).

## Hiện trạng liên quan

- Bán hàng: khách + đơn nhiều dòng + thanh toán + `totalDebt`
- Kho: nhập lẻ (vật liệu, sl, `cost`, `contractor` text) → cộng tồn, cập nhật `avgCost`
- Tổng kết: kỳ / kho / khách — chưa có sổ nhà cung cấp
- Không có collection nhà cung cấp hay đơn mua

## Hướng đã chọn

Soi gương Bán hàng: danh mục NCC + chứng từ đơn mua. Nhận hàng tạo `stockEntries` (nhập kho). Nhập kho lẻ ở Kho vẫn giữ.

---

## 1. Dữ liệu

### 1.1 `suppliers`

| Trường | Ý nghĩa |
|---|---|
| `name`, `taxCode`, `address`, `phone`, `email`, `note` | Hồ sơ |
| `openingDebt` | Nợ cũ trước khi dùng app (mặc định 0) |
| `openingAt` | Mốc nợ cũ (mặc định `createdAt`) |
| `pendingCarry` | Số dư chờ cộng vào đơn mua kế (dương = còn nợ, âm = trả thừa) |
| `pendingCarryFromOrderId` | Đơn vừa chuyển số dư (nếu có) |
| `totalDebt` | Cache: `openingDebt + Σ lineTotal(đơn chốt/đóng, không huỷ) − Σ đã chuyển` |
| `totalPurchased` | Cache: `Σ lineTotal` các đơn chốt/đóng, không huỷ |
| `active`, `createdAt`, `updatedAt` | |

`pendingCarry` **không** cộng thêm vào `totalDebt` — số đó đã nằm trong `lineTotal − đã chuyển` của đơn nguồn.

Xóa NCC chỉ khi không còn đơn mua.  
`openingDebt` / `openingAt` chỉ sửa khi NCC chưa có đơn `open`/`closed`; Superadmin được sửa sau đó.

### 1.2 `purchaseOrders` — một đơn = một vật liệu

| Trường | Ý nghĩa |
|---|---|
| `code` | `MH` + YYMMDD + `-` + 4 số, ví dụ `MH260909-4821` |
| `supplierId`, `supplierName` | Snapshot tên |
| `materialId`, `materialName`, `unit` | Chọn từ list vật liệu; `unit` lấy từ vật liệu, không sửa trên đơn |
| `quantity` | Số lượng đặt (> 0) |
| `unitPrice` | Đơn giá |
| `lineTotal` | `quantity × unitPrice` (không VAT) |
| `carriedIn` | Số dư cộng từ đơn trước / `pendingCarry` (có thể âm) |
| `carriedFromOrderId` | Đơn nguồn (nếu có) |
| `carriedOut` | Số đã chuyển sang đơn sau khi đóng (0 nếu không chuyển) |
| `carriedToOrderId` | Đơn đích sau khi đã cộng (nếu đã tạo đơn sau) |
| `payments[]` | `{ id, amount, note, paidAt, createdBy, createdByName }` |
| `receipts[]` | `{ id, quantity, createdAt, createdBy, createdByName, stockEntryId }` |
| `status` | `draft` \| `open` \| `closed` \| `huy` |
| `note`, `orderAt`, `createdAt`, `updatedAt`, `createdBy`, `createdByName` | |

Công thức trên đơn (luôn tính lại, không tin số cũ):

```
paidTotal      = Σ payments.amount
receivedQty    = Σ receipts.quantity
totalAmount    = lineTotal + carriedIn
remainingAmount = totalAmount − paidTotal − carriedOut
remainingQty   = quantity − receivedQty
```

- `remainingAmount > 0`: còn nợ trên đơn  
- `remainingAmount < 0`: trả thừa  
- `remainingQty` không âm: không nhận vượt số đặt

### 1.3 Nhận hàng → kho

Mỗi lần nhận:

1. `receipt.quantity` > 0 và ≤ `remainingQty`
2. Gọi `addStockEntry` với `type: 'import'`, `cost = receipt.quantity × unitPrice` (tổng tiền lô, đúng cách tính `avgCost` hiện tại)
3. Gắn `purchaseOrderId`, `orderCode`, `contractor = supplierName` trên phiếu nhập
4. Lưu `stockEntryId` vào receipt

Nhập kho lẻ (Kho → Nhập kho) không bắt buộc đơn mua.

### 1.4 Trạng thái

| Status | Công nợ / sổ | Nhận hàng | Trả tiền | Sửa sl/giá |
|---|---|---|---|---|
| `draft` | Không | Không | Có (chỉ ghi trên đơn, chưa vào sổ NCC) | Có |
| `open` | Có | Có | Có | Chỉ khi `receivedQty = 0` |
| `closed` | Có (số dư đã xử lý) | Không | Không | Không |
| `huy` | Không | Không | Không | Không |

- **Lưu nháp** → `draft`  
- **Chốt đơn** → `open`, cộng `totalDebt` / `totalPurchased` theo `lineTotal`  
- Thanh toán trên `draft` chưa vào sổ NCC; khi chốt, các `payments` vào sổ theo `paidAt` gốc (không đổi thành ngày chốt)  
- **Huỷ**: chỉ khi `receivedQty = 0`. Nếu đơn `open`, trừ công nợ đã cộng. Nếu đơn đã hút `pendingCarry` (`carriedIn ≠ 0`), trả `carriedIn` về `supplier.pendingCarry`  
- **Đóng đơn**: xem mục 2.3  
- Mở lại đơn đóng: chỉ Superadmin

---

## 2. Luồng

### 2.1 Tạo đơn `open`

1. Chọn NCC (SearchableSelect; có thể tạo nhanh NCC tối thiểu: tên)  
2. Chọn đúng một vật liệu đang `active`  
3. Nhập số lượng, đơn giá → thành tiền  
4. Nếu NCC có `pendingCarry ≠ 0`: gán `carriedIn = pendingCarry`, xóa `pendingCarry` trên NCC, lưu `carriedFromOrderId`  
5. Có thể thêm lần chuyển tiền ngay trên form  
6. Chốt → đơn `open`

Đơn `draft` **không** lấy `pendingCarry` (tránh nuốt số dư rồi không chốt). Khi chốt draft, mới áp dụng `pendingCarry` lúc đó (cộng vào `totalAmount` / còn lại). Hai lần chốt gần nhau: lần nào ghi NCC trước thì lấy hết `pendingCarry`, lần sau nhận 0.

### 2.2 Trả tiền

Thêm đợt trên đơn `draft` hoặc `open`. `amount` > 0. Cho phép tổng đã chuyển > `totalAmount` (trả thừa → `remainingAmount` âm).

Không có phiếu trả tiền “treo” ngoài đơn trong bản này. Mọi lần chuyển gắn một đơn.

### 2.3 Đóng đơn và chuyển số dư

Điều kiện: `status === 'open'`.

- Nếu `remainingAmount === 0`: đóng, không hỏi.  
- Nếu `remainingAmount !== 0`: hỏi **Chuyển số dư sang đơn hàng sau?**

**Có:**

1. `carriedOut = remainingAmount` (trước khi ghi `carriedOut`, tức `totalAmount − paidTotal`)  
2. `supplier.pendingCarry += carriedOut`  
3. `pendingCarryFromOrderId =` id đơn này  
4. `status = closed`  
5. Đơn mua `open`/`draft` kế **cùng NCC** khi được **chốt** sẽ nhận `carriedIn` (mục 2.1)

**Không:**

1. `carriedOut = 0`  
2. `status = closed`  
3. Số dư đứng trên đơn này; `totalDebt` không đổi; đơn sau không bị cộng

Chuyển số dư chỉ đổi đơn nào giữ nợ, **không** tạo phát sinh nhập mua mới.

### 2.4 Quyền

Giống đơn bán: Admin/Superadmin ghi. Superadmin xoá đơn / mở lại. Viewer đọc Mua hàng và tab sổ NCC, không sửa.

---

## 3. Giao diện

### 3.1 Điều hướng

- Menu **Mua hàng** → `/mua-hang`, đặt giữa Bán hàng và Kho  
- Viewer: cùng mục, chỉ xem  
- Cài đặt: tab **Nhà cung cấp** (song song Khách hàng): CRUD, nhập `openingDebt`

### 3.2 Trang Mua hàng

- Danh sách đơn: mã, ngày, NCC, vật liệu, sl đặt / đã nhận, tổng tiền, đã chuyển, còn lại, trạng thái  
- Lọc: NCC, trạng thái, khoảng ngày  
- Tạo / sửa (nháp hoặc `open` chưa nhận hàng): form một cột, mobile-first, SearchableSelect  
- Chi tiết: nhận hàng, thêm lần chuyển tiền, đóng đơn (modal hỏi chuyển số dư)

### 3.3 Tổng kết → tab Nhà cung cấp

Cùng bộ chọn kỳ (ngày / tuần / tháng / năm) như tab Theo kỳ.

Bảng mỗi NCC (kể cả nợ = 0 trong kỳ nếu có chứng từ hoặc `openingDebt`):

| Nhà cung cấp | Nợ đầu kỳ | Nhập mua | Trả tiền | Nợ cuối kỳ |
|---|---|---|---|---|

Bấm một NCC: danh sách phát sinh trong kỳ (chốt đơn = nhập mua; lần chuyển = trả tiền).

---

## 4. Công thức sổ kỳ

Kỳ `[from, to]` (ms, inclusive). Chỉ đơn `open` hoặc `closed` (không `draft`, không `huy`).

```
purchasesBefore = Σ lineTotal của đơn có orderAt < from
paymentsBefore  = Σ amount của payment có paidAt < from
                 trên đơn open/closed

Nợ đầu = openingDebt (nếu openingAt < from, không thì 0)
         + purchasesBefore − paymentsBefore

Nhập mua = Σ lineTotal của đơn có from ≤ orderAt ≤ to
           (không cộng carriedIn / carriedOut)

Trả tiền = Σ payment.amount có from ≤ paidAt ≤ to
           trên đơn open/closed

Nợ cuối = Nợ đầu + Nhập mua − Trả tiền
```

`orderAt` lấy lúc **chốt** (không phải lúc lưu nháp). Khi chốt, set `orderAt = Date.now()` nếu chưa có.

Kiểm tra: `Σ Nợ cuối` mọi NCC = tổng công nợ hệ thống tại `to` (trừ NCC không hiện vì không có số liệu — vẫn tính đủ khi cộng toàn bộ NCC).

---

## 5. Firestore

Collection mới: `suppliers`, `purchaseOrders`.  
`stockEntries` thêm field tùy chọn: `purchaseOrderId`, `orderCode` (đã có), `supplierId`.

Rules: đọc nếu user active; tạo/sửa nếu admin; xóa nếu superadmin — cùng kiểu `customers` / `orders`.

Không đổi schema đơn bán và khách hàng.

---

## 6. Ràng buộc

- Một đơn một `materialId`; không thêm dòng  
- Không nhận vượt `quantity`  
- Cho trả vượt `totalAmount`  
- `lineTotal` luôn `quantity × unitPrice`  
- Chốt đơn mới lấy `pendingCarry`; nháp không lấy  
- Đóng + chuyển: cộng vào `pendingCarry`; đơn chốt kế tiếp cùng NCC nhận hết một lần  
- Viewer không ghi  
- Nhập kho lẻ không bắt buộc NCC/đơn mua  

---

## 7. Kiểm tra chấp nhận

1. Tạo NCC, nhập nợ cũ 10tr → sổ kỳ hiện tại: nợ đầu 10tr (nếu `openingAt` trước kỳ).  
2. Chốt đơn 5 tấn × 2tr = 10tr, chưa trả → nợ cuối +10tr; kho chưa tăng.  
3. Nhận 3 tấn → tồn +3, `avgCost` cập nhật; sl đã thực hiện = 3; còn nhận = 2.  
4. Chuyển 4tr → còn lại = 10tr + carriedIn − 4tr − carriedOut.  
5. Đóng + chuyển số dư; tạo đơn mới cùng NCC → `carriedIn` bằng số dư; sổ kỳ không tăng “Nhập mua” vì số dư.  
6. Đóng không chuyển → đơn sau `carriedIn = 0`; nợ vẫn trên đơn cũ.  
7. Nhập kho lẻ không chọn đơn → tồn tăng, sổ NCC không đổi.  
8. Viewer mở Mua hàng: thấy danh sách, không có nút tạo/nhận/trả/đóng.  
9. Huỷ đơn `open` chưa nhận hàng → công nợ hoàn lại; `pendingCarry` (nếu đơn đã hút) được trả về NCC.
