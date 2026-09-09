# Sản xuất — định mức % và trừ kho

Ngày: 2026-09-09  
App: An Phát  
Nguồn: file Excel yêu cầu + làm rõ 2026-09-09  
Trạng thái: chờ duyệt spec — chưa triển khai

## Mục tiêu

Lệnh sản xuất: chọn thành phẩm + sản lượng, tùy chọn gắn đơn **bán**, tính nhu cầu vật liệu theo nhóm (đá / nhựa-dầu-than / nhập tay), chốt thì trừ kho. Thành phẩm không nhập kho. Báo cáo tồn kho theo kỳ và theo dõi giá trị đơn bán (được âm khi SX vượt).

## Ngoài phạm vi

- Đổi quy trình bán hàng theo file sẽ gửi sau (ngoài việc **bỏ trừ kho khi chốt đơn bán** — xem mục 6)
- Sổ nhà cung cấp / đơn mua — spec `2026-09-09-mua-hang-ncc-design.md`
- Kho thành phẩm, giao hàng xuất thành phẩm

## Hiện trạng liên quan

- Cài đặt → Sản phẩm: công thức `quantityPerUnit` (kg NVL / 1 đơn vị TP)
- Chốt đơn bán: `deductStock` theo công thức đó; thiếu hàng thì chặn chốt
- Kho: tồn hiện tại + lịch sử nhập/xuất, **chưa** có sổ đầu/nhập/xuất/cuối theo kỳ

File Excel dùng **tỷ lệ %** và hệ số đá — khác mô hình `quantityPerUnit`. Module SX chuyển sang %; công thức cũ không dùng để trừ kho.

---

## 1. Định mức trên thành phẩm (Cài đặt)

Mỗi sản phẩm (BTN…) có một bộ định mức SX. Vật liệu chọn từ danh mục Kho. Mỗi dòng:

| Trường | Ý nghĩa |
|---|---|
| `materialId`, `materialName`, `unit` | Snapshot |
| `calcType` | `stone` \| `nhua` \| `rate` \| `manual` |
| `percent` | Tỷ lệ người dùng nhập. `5.2` = 5,2% → nhân `percent / 100`. `manual` không dùng % |

`calcType`:

- `nhua` — nhựa đường: `sl = làmTròn2(sảnLượng × percent / 100)`. Tổng sl mọi dòng `nhua` là phần **trừ** khi tính đá
- `stone` — đá: `sl = làmTròn4((sảnLượng − tổngSlNhựa) × percent / 100 × hệSốĐá)`
- `rate` — dầu diesel, FO, than: `sl = làmTròn2(sảnLượng × percent / 100)`
- `manual` — MC, nhũ (CRS, CSS…): người gõ sl, **không** làm tròn

Hệ số đá mặc định `1.03`, **chỉ áp dụng nhóm đá**. Trên định mức và trên từng lệnh có ô sửa hệ số (đổi được ngay khi nhà máy thay đổi).

Làm tròn: đá 4 chữ số thập phân; nhựa / dầu / than 2 chữ số; MC / nhũ giữ nguyên số nhập.

Thứ tự tính trên lệnh:

1. Tính mọi dòng `nhua`
2. Tính `rate`
3. Tính `stone` (đã có tổng nhựa)
4. Giữ `manual` như form

Phải có ít nhất một dòng `nhua` nếu có dòng `stone`. Không có `nhua` thì đá dùng `(sảnLượng − 0)`.

Không hard-code 16 dòng Excel. File là ví dụ BTN: cùng kiểu tính, vật liệu lấy từ Kho, % từng thành phẩm khác nhau.

---

## 2. Lệnh sản xuất

Collection `productionOrders`.

| Trường | Ý nghĩa |
|---|---|
| `code` | `SX` + YYMMDD + `-` + 4 số |
| `formulaId`, `formulaName` | Thành phẩm |
| `quantity` | Sản lượng G4 (> 0), cùng đơn vị sản phẩm |
| `stoneFactor` | Hệ số đá (mặc định 1.03, sửa được) |
| `salesOrderId`, `salesOrderCode`, `salesOrderLineId` | Tùy chọn — một dòng đơn bán |
| `salesUnitPrice` | Đơn giá dòng đơn bán lúc gắn (snapshot) |
| `lines[]` | Snapshot: materialId, name, unit, calcType, percent, quantity |
| `status` | `draft` \| `confirmed` \| `huy` |
| `confirmedAt`, `stockDeducted` | |
| `note`, `createdAt`, `updatedAt`, `createdBy`, `createdByName` | |

Luồng:

1. Chọn thành phẩm → nạp định mức (%, kiểu tính, hệ số)
2. Nhập sản lượng; tùy chọn **chọn đơn bán đã lập** hoặc không gắn
3. Nếu gắn đơn: chọn đúng một dòng thành phẩm trùng `formulaId`; lấy `salesUnitPrice` từ dòng đó
4. Sửa % / hệ số / sl `manual` trên lệnh (không ghi đè định mức gốc trừ khi user lưu lại định mức)
5. Xem sl tính được; nếu tồn < sl trừ thì **cảnh báo**, vẫn cho chốt
6. **Chốt** → `confirmed`, trừ kho từng dòng `quantity > 0` (phiếu `export`, `orderCode` = mã lệnh SX). Tồn không âm: số trừ thực tế = `min(tồn, nhu cầu)`; phiếu xuất ghi số trừ thực tế. Lệnh vẫn lưu nhu cầu đủ (cột thiếu = nhu cầu − đã trừ)
7. Thành phẩm **không** nhập kho
8. Huỷ lệnh đã chốt: chỉ Superadmin; cộng trả kho (phiếu nhập điều chỉnh) nếu đã trừ

Nháp không trừ kho.

Một đơn bán được gắn nhiều lệnh SX (SX nhiều đợt). Một lệnh chỉ gắn một dòng đơn.

---

## 3. Giao diện

- Menu **Sản xuất** → `/san-xuat`, thứ tự: Tổng quan · Bán hàng · Mua hàng · Sản xuất · Kho · Tổng kết · Cài đặt
- Danh sách lệnh + tạo/chốt
- Form: thành phẩm, sản lượng, hệ số đá, chọn đơn bán (SearchableSelect, có mục “Không gắn đơn”), bảng vật liệu (%, sl tính / sl nhập tay, tồn, thiếu)
- Cài đặt → Sản phẩm: sửa định mức theo `calcType` + % (thay chỗ trừ kho dựa trên `quantityPerUnit`)
- Viewer: xem lệnh, không chốt

---

## 4. Báo cáo tồn kho theo kỳ

Chỗ: Tổng kết tab Kho (thay/bổ sung card tồn hiện tại) và/hoặc Kho → Tổng kết kho.

Kỳ `[from, to]` giống Tổng kết hiện tại. Mỗi vật liệu active:

```
nhập  = Σ stockEntries import trong kỳ
xuất  = Σ stockEntries export trong kỳ
tồn cuối tại `to` = stock hiện tại − nhập(sau to) + xuất(sau to)
tồn đầu           = tồn cuối − nhập(kỳ) + xuất(kỳ)
```

(`sau to` = `createdAt > to`)

Cột: Vật liệu | Đầu kỳ | Số nhập | Xuất | Tồn cuối | Đơn vị  

Nguồn xuất gồm lệnh SX và xuất khác (nếu còn). Nguồn nhập gồm nhận đơn mua + nhập kho lẻ.

Sửa tồn tay trên thẻ kho (nếu còn) phải tạo phiếu điều chỉnh; nếu không, sổ kỳ lệch.

---

## 5. Báo cáo theo dõi đơn hàng

Chỗ: Tổng kết tab mới hoặc tab Theo kỳ bổ sung. Mỗi đơn bán không huỷ:

```
giá trị đơn hàng     = totalAmount (sau VAT/chiết khấu như đang lưu)
giá trị đã thực hiện = Σ (quantity lệnh SX confirmed gắn đơn × salesUnitPrice của lệnh)
giá trị còn lại      = giá trị đơn − đã thực hiện
```

`còn lại` **được âm** (SX vượt kế hoạch) hoặc dương (chưa làm đủ).

Đơn không có lệnh SX: đã thực hiện = 0, còn lại = giá trị đơn.  
Lệnh không gắn đơn: không cộng vào báo cáo này (chỉ hiện ở danh sách SX).

Nếu đơn nhiều dòng: chỉ các lệnh gắn đúng `salesOrderLineId` cộng vào; `salesUnitPrice` là đơn giá dòng đó.  
`đã thực hiện` không dùng `lineTotal` đầy đủ (VAT/chiết khấu) — đúng yêu cầu “sl × đơn giá”.

---

## 6. Đổi đơn bán (trong phạm vi spec này)

Khi module SX chạy:

- **Không** gọi `deductStock` khi tạo / chốt / đổi trạng thái đơn bán
- **Không** chặn chốt đơn bán vì thiếu NVL
- `stockDeducted` trên đơn bán cũ: giữ nguyên lịch sử, không trừ thêm
- Đơn bán vẫn theo dõi tiền, khách, trạng thái theo tiền như hiện tại

Ước tính NVL trên form bán (nếu còn hiện) chỉ tham khảo, không trừ kho.

---

## 7. Firestore

- `productionOrders`: đọc nếu active; tạo/sửa nếu admin; xóa nếu superadmin
- `formulas`: thêm `productionItems[]` (`calcType`, `percent`) trên recipe; recipe cũ `items.quantityPerUnit` giữ để đọc, không trừ kho
- `stockEntries`: `type: 'export'` + `orderCode` mã SX; không đổi collection

---

## 8. Kiểm tra chấp nhận

1. Thành phẩm có đá 40%, nhựa 5%, than 1%, hệ số 1.03, sản lượng 10.000: nhựa = 500.00; đá = (10000 − 500) × 0.40 × 1.03 = 3914.0000; than = 100.00.
2. Đổi hệ số trên lệnh thành 1.00 → đá đổi ngay, định mức gốc không đổi.
3. MC gõ 12.345 → giữ 12.345.
4. Gắn đơn bán đơn giá 1.200.000, SX 10 tấn → đã thực hiện +12.000.000; còn lại được âm nếu SX tiếp vượt tiền đơn.
5. Không gắn đơn → trừ kho vẫn xảy ra; báo cáo theo dõi đơn không tăng.
6. Tồn đá 100, cần 3914 → cảnh báo thiếu, vẫn chốt được; tồn về 0 (trừ `max` theo `deductStock` hiện tại: không âm).
7. Chốt đơn bán sau khi có SX → tồn không bị trừ lần hai.
8. Báo cáo kho kỳ: đầu + nhập − xuất = cuối.
