# An Phát — Tài liệu rà soát toàn hệ thống

Ngày: 2026-09-09  
Dùng để bạn đọc và bắt lỗi. Chưa viết code phần Mua / SX mới.

**Chú thích trạng thái**

- **[ĐÃ CÓ]** đang chạy trên app
- **[SẼ LÀM]** đã thống nhất, chưa làm
- **[ĐỔI]** app cũ sẽ đổi khi làm SX

---

# A. Bức tranh chung

Bốn hạng mục: **Mua hàng · Kho · Sản xuất · Bán hàng**.

```
Nhà cung cấp          Kho vật liệu           Thành phẩm              Khách hàng
     │                     │                     │                       │
     │  chốt đơn mua       │                     │                       │
     │  → ghi NỢ NCC       │                     │                       │
     │                     │                     │                       │
     │  nhận hàng ─────────► cộng TỒN            │                       │
     │                     │                     │                       │
     │  chuyển tiền        │                     │                       │
     │  → giảm NỢ NCC      │                     │                       │
     │                     │  chốt lệnh SX       │                       │
     │                     │  → trừ TỒN ─────────► (không nhập kho)       │
     │                     │                     │                       │
     │                     │                     │   gắn đơn bán ─────────► cộng “đã thực hiện”
     │                     │                     │                       │
     │                     │                     │         chốt đơn bán ─► ghi NỢ KHÁCH
     │                     │                     │         (không trừ kho) [ĐỔI]
     │                     │                     │                       │
     │                     │  nhập kho lẻ ───────► cộng TỒN (không bắt buộc đơn mua)
```

Kho **chỉ chứa vật liệu**. Thành phẩm (BTN…) trộn xong giao/dùng luôn, không có kho thành phẩm.

---

# B. Người dùng và quyền

**[ĐÃ CÓ]**

| Vai trò | Việc được làm |
|---|---|
| Superadmin | Tất cả + xóa vật liệu, mở khóa đơn, xem nhật ký sửa |
| Admin | Tạo/sửa đơn, kho, cài đặt (trừ một số xóa) |
| Viewer | Chỉ xem (Tổng quan, Đơn hàng, Kho). **[SẼ LÀM]** xem thêm Mua hàng, Sản xuất, sổ NCC — không bấm ghi |

Tài khoản khóa (`active = false`) không vào được hệ thống.

---

# C. Cài đặt (danh mục)

## C.1 Vật liệu **[ĐÃ CÓ]**

Mỗi vật liệu: tên, mô tả, đơn vị, tồn, giá vốn bình quân, mức cảnh báo sắp hết, bật/tắt.

Phân loại tồn (chỉ để cảnh báo, không chặn):

- Tồn = 0 → **Đã hết**
- 0 < tồn ≤ mức cảnh báo → **Sắp hết**
- Tồn > mức cảnh báo → ổn

## C.2 Đơn vị và quy đổi **[ĐÃ CÓ]**

Đơn vị mặc định: Tấn, Kg, Khối, Lít, Thùng, Bao. Admin thêm đơn vị tùy chỉnh.

Quy đổi: 1 đơn vị nguồn = `factor` đơn vị đích (ví dụ 1 Tấn = 1000 Kg). Dùng để **hiện tồn 2 đơn vị**. Tính mua/SX/trừ kho theo **đơn vị lưu của vật liệu** (đơn vị nhập).

## C.3 Sản phẩm / thành phẩm **[ĐÃ CÓ + ĐỔI]**

**Hiện tại:** công thức kiểu “mỗi 1 đơn vị thành phẩm cần X vật liệu” (`quantityPerUnit`). Chốt đơn bán đang trừ kho theo công thức này.

**Sau này [SẼ LÀM]:** mỗi thành phẩm có **định mức sản xuất theo %**. Vật liệu chọn từ Kho. Mỗi dòng:

| Trường | Ý nghĩa |
|---|---|
| Vật liệu | Chọn từ danh mục Kho |
| Kiểu tính | Nhựa / Đá / Tỷ lệ (dầu, than) / Nhập tay (MC, nhũ) |
| % | Số người nhập. `5.2` nghĩa là **5,2%** → trong công thức nhân `5.2 / 100` |
| Hệ số đá | Mặc định 1,03; chỉ dùng cho dòng kiểu Đá; sửa được |

Công thức cũ (`quantityPerUnit`) giữ để đọc dữ liệu cũ, **không còn trừ kho**.

## C.4 Khách hàng **[ĐÃ CÓ]**

Tên, MST, địa chỉ, SĐT, email, ghi chú.  
Cache: `totalDebt` (còn nợ), `totalPurchased` (tổng đã mua).

## C.5 Nhà cung cấp **[SẼ LÀM]**

Giống khách, thêm:

- `openingDebt` = nợ cũ trước khi dùng app (mặc định 0)
- `openingAt` = ngày mốc nợ cũ
- `pendingCarry` = số dư đang chờ cộng vào đơn mua kế (dương = còn nợ, âm = trả thừa)

Chỉ xóa NCC khi không còn đơn mua.  
Nợ cũ chỉ sửa khi chưa có đơn đã chốt (Superadmin sửa được sau đó).

---

# D. Mua hàng **[SẼ LÀM]**

## D.1 Một đơn mua là gì

**Một NCC + đúng một vật liệu** (chọn từ list Kho). Không nhiều dòng. Không VAT / chiết khấu.

| Trường | Ý nghĩa |
|---|---|
| Mã | `MHyyMMdd-xxxx` (ví dụ MH260909-4821) |
| Sl đặt | Số lượng đặt, > 0 |
| Đơn vị | Lấy từ vật liệu, không sửa trên đơn |
| Đơn giá | Người nhập |
| Trạng thái | Nháp / Đã chốt / Đã đóng / Huỷ |

## D.2 Công thức trên một đơn

Gọi:

- `Q` = sl đặt  
- `P` = đơn giá  
- `C_in` = số dư **chuyển vào** từ đơn trước (có thể âm)  
- `C_out` = số dư **đã chuyển đi** khi đóng đơn (0 nếu không chuyển)  
- `Pay_1, Pay_2, …` = từng lần chuyển tiền  
- `Nhan_1, Nhan_2, …` = từng lần nhận hàng  

```
Thành tiền          = Q × P
Tổng tiền đơn       = Thành tiền + C_in
Tiền đã chuyển      = Pay_1 + Pay_2 + …
Còn lại (tiền)      = Tổng tiền đơn − Tiền đã chuyển − C_out

Sl đã nhận          = Nhan_1 + Nhan_2 + …
Còn nhận            = Q − Sl đã nhận
```

**Ý nghĩa còn lại**

- Còn lại > 0 → còn nợ trên đơn  
- Còn lại = 0 → hết  
- Còn lại < 0 → trả thừa  

**Ràng buộc**

- Không nhận vượt sl đặt: mỗi lần nhận > 0 và ≤ còn nhận  
- Cho phép chuyển tiền vượt tổng tiền đơn  

## D.3 Ví dụ số — một đơn, chưa có số dư chuyển

Đặt 5 tấn đá, đơn giá 2.000.000.

```
Thành tiền     = 5 × 2.000.000 = 10.000.000
Tổng tiền đơn  = 10.000.000 + 0 = 10.000.000
```

Nhận 3 tấn, chuyển 4.000.000:

```
Sl đã nhận     = 3
Còn nhận       = 5 − 3 = 2
Đã chuyển      = 4.000.000
Còn lại        = 10.000.000 − 4.000.000 − 0 = 6.000.000
```

Kho: tồn đá **+3**. Giá vốn bình quân cập nhật (mục E.3).

## D.4 Trạng thái và việc được phép

| | Nháp | Đã chốt | Đã đóng | Huỷ |
|---|---|---|---|---|
| Vào sổ nợ NCC | Không | Có | Có (số dư đã xử lý) | Không |
| Nhận hàng | Không | Có | Không | Không |
| Chuyển tiền | Có (chưa vào sổ NCC) | Có | Không | Không |
| Sửa sl / giá | Có | Chỉ khi chưa nhận hàng | Không | Không |

- **Lưu nháp:** chưa ghi nợ. Chưa lấy số dư chờ của NCC.  
- **Chốt:** ghi nợ NCC tăng đúng **thành tiền** (`Q × P`). Lấy `pendingCarry` của NCC (nếu có) thành `C_in`. Các lần chuyển lúc nháp **vào sổ theo ngày chuyển gốc**. Ngày chốt = mốc “nhập mua” trên sổ kỳ.  
- **Huỷ:** chỉ khi chưa nhận hàng. Hoàn nợ đã ghi. Nếu đơn đã hút `pendingCarry`, trả lại NCC.  
- Mở lại đơn đóng: chỉ Superadmin.

Hai người chốt hai đơn cùng lúc: ai ghi NCC trước lấy hết số dư chờ, đơn kia nhận 0.

## D.5 Nhận hàng → kho

Mỗi lần nhận `n` (0 < n ≤ còn nhận):

```
Cộng tồn vật liệu  += n
Tiền lô nhập (để tính giá vốn) = n × P
```

Phiếu nhập gắn mã đơn mua + tên NCC.  
**Nhập kho lẻ** (màn Kho) vẫn dùng, không bắt buộc đơn mua, không ghi sổ NCC.

## D.6 Đóng đơn và chuyển số dư

Chỉ đóng đơn đang **đã chốt**.

- Nếu còn lại = 0: đóng, không hỏi.  
- Nếu còn lại ≠ 0: hỏi **Chuyển số dư sang đơn hàng sau?**

**Chọn Có**

```
C_out = Tổng tiền đơn − Tiền đã chuyển     (chưa trừ C_out)
Còn lại sau đóng = Tổng − đã chuyển − C_out = 0
pendingCarry của NCC += C_out
```

Đơn mua **cùng NCC** khi được **chốt** tiếp theo:

```
C_in của đơn mới = pendingCarry
pendingCarry     = 0
Tổng tiền đơn mới = (Q_mới × P_mới) + C_in
```

**Chọn Không**

```
C_out = 0
Đơn đóng, còn lại giữ nguyên trên đơn này
Đơn sau không bị cộng
Nợ NCC không đổi
```

Chuyển số dư **chỉ đổi đơn nào giữ nợ**, không tạo lần “nhập mua” mới trên sổ.

## D.7 Ví dụ — chuyển số dư

**Đơn 1:** thành tiền 10.000.000, đã chuyển 7.000.000, đóng + chuyển.

```
C_out          = 3.000.000
Còn lại đơn 1  = 0
pendingCarry   = 3.000.000
```

**Đơn 2** cùng NCC, đặt 4 tấn × 2.000.000 = 8.000.000, chốt:

```
C_in           = 3.000.000
Tổng tiền đơn 2 = 8.000.000 + 3.000.000 = 11.000.000
```

Trên **sổ kỳ**: nhập mua đơn 2 chỉ tính **8.000.000**, không tính 3.000.000 (đã tính ở đơn 1).

## D.8 Sổ nhà cung cấp theo kỳ **[SẼ LÀM]**

Kỳ `[từ, đến]` (ngày / tuần / tháng / năm, giống Tổng kết hiện tại). Chỉ tính đơn **đã chốt** hoặc **đã đóng** (bỏ nháp, huỷ).

```
Mua trước kỳ   = tổng (Q × P) các đơn chốt trước ngày “từ”
Trả trước kỳ   = tổng lần chuyển có ngày trước “từ”
Nợ cũ          = openingDebt nếu openingAt < “từ”, không thì 0

Nợ đầu kỳ      = Nợ cũ + Mua trước kỳ − Trả trước kỳ
Nhập mua       = tổng (Q × P) các đơn chốt trong kỳ     ← không cộng C_in, C_out
Trả tiền       = tổng lần chuyển trong kỳ
Nợ cuối kỳ     = Nợ đầu + Nhập mua − Trả tiền
```

Nợ hiện tại trên NCC (mọi thời điểm):

```
totalDebt = openingDebt + tổng (Q × P) đơn chốt/đóng − tổng đã chuyển
```

`pendingCarry` **không** cộng thêm vào `totalDebt` (đã nằm trong mua − trả của đơn nguồn).

---

# E. Kho

## E.1 Việc làm tồn thay đổi

| Việc | Tồn |
|---|---|
| Nhận hàng đơn mua **[SẼ LÀM]** | + sl nhận |
| Nhập kho lẻ **[ĐÃ CÓ]** | + sl nhập |
| Chốt lệnh SX **[SẼ LÀM]** | − sl trừ thực tế |
| Chốt đơn bán **[ĐỔI]** | **Không đổi** (cũ đang trừ) |
| Sửa tồn tay trên thẻ kho **[ĐÃ CÓ]** | Sửa thẳng — dễ lệch sổ kỳ nếu không có phiếu |

## E.2 Cảnh báo tồn **[ĐÃ CÓ]**

Xem C.1. Không tự chặn nhập/SX (SX chỉ **cảnh báo** khi thiếu).

## E.3 Giá vốn bình quân khi nhập **[ĐÃ CÓ]** — dùng lại khi nhận đơn mua

`cost` trên phiếu = **tổng tiền lô**, không phải đơn giá.

```
Tồn mới     = Tồn cũ + sl nhập
Giá trị mới = (giá vốn cũ × tồn cũ) + tiền lô
Giá vốn mới = Giá trị mới / Tồn mới     (tồn mới = 0 thì giá vốn = 0)
```

Nhận đơn mua: `tiền lô = sl nhận × đơn giá trên đơn`.

Xuất SX **không** đổi giá vốn, chỉ giảm tồn.

## E.4 Báo cáo tồn kho theo kỳ **[SẼ LÀM]**

Mỗi vật liệu đang bật, kỳ `[từ, đến]`:

```
Nhập (kỳ)     = tổng phiếu nhập trong kỳ
Xuất (kỳ)     = tổng phiếu xuất trong kỳ
Tồn cuối      = tồn hiện tại − nhập sau “đến” + xuất sau “đến”
Tồn đầu       = Tồn cuối − Nhập (kỳ) + Xuất (kỳ)
```

Kiểm tra: `Tồn đầu + Nhập − Xuất = Tồn cuối`.

Nguồn nhập: nhận đơn mua + nhập lẻ.  
Nguồn xuất: lệnh SX (và xuất khác nếu còn).

---

# F. Sản xuất **[SẼ LÀM]**

## F.1 Một lệnh SX là gì

- Chọn **một thành phẩm** + **sản lượng** (cùng đơn vị sản phẩm).  
- Có thể **gắn một dòng đơn bán** (cùng thành phẩm) — hoặc không gắn.  
- Nạp định mức (%, kiểu tính, hệ số đá). Được sửa % / hệ số / sl nhập tay **trên lệnh** (không tự ghi đè định mức gốc).  
- Một đơn bán gắn được **nhiều lệnh** (SX nhiều đợt). Một lệnh chỉ gắn một dòng đơn.  
- Mã: `SXyyMMdd-xxxx`.

## F.2 Quy ước %

Người nhập `5.2` = **5,2%**.

```
hệ_số_% = percent / 100
ví dụ 5.2 → 0.052
```

Nếu nhà máy đang nhập sẵn `0.052` thì phải đổi quy ước này — cần bạn xác nhận khi rà.

## F.3 Bốn kiểu tính

Gọi `G` = sản lượng thành phẩm trên lệnh.

**Bước 1 — Nhựa** (`kiểu = nhua`)

```
sl_nhựa_i = làm_tròn_2( G × percent_i / 100 )
Tổng_nhựa = sl_nhựa_1 + sl_nhựa_2 + …     (thường một dòng)
```

Nếu không có dòng nhựa: `Tổng_nhựa = 0`.

**Bước 2 — Dầu, than** (`kiểu = rate`)

```
sl = làm_tròn_2( G × percent / 100 )
```

Không trừ nhựa. Không nhân hệ số đá.

**Bước 3 — Đá** (`kiểu = stone`)

```
Hệ_số_đá = ô nhập trên lệnh, mặc định 1.03, chỉ áp dụng đá
sl_đá = làm_tròn_4( (G − Tổng_nhựa) × percent / 100 × Hệ_số_đá )
```

**Bước 4 — MC, nhũ** (`kiểu = manual`)

```
sl = số người gõ, không làm tròn
```

**Làm tròn**

- Đá: 4 chữ số thập phân  
- Nhựa, dầu, than: 2 chữ số thập phân  
- MC, nhũ: giữ nguyên  

## F.4 Ví dụ đầy đủ (theo file)

`G = 10.000`

| Vật liệu | Kiểu | % | Công thức | Kết quả |
|---|---|---|---|---|
| Nhựa đường | nhựa | 5 | 10000 × 0.05 | **500,00** |
| Đá 2×2 | đá | 40 | (10000 − 500) × 0.40 × 1.03 | **3.914,0000** |
| Than | tỷ lệ | 1 | 10000 × 0.01 | **100,00** |
| Diesel | tỷ lệ | 0,8 | 10000 × 0.008 | **80,00** |
| MC | nhập tay | — | gõ 12,345 | **12,345** |

Đổi hệ số đá trên lệnh thành `1.00`:

```
Đá 2×2 = (10000 − 500) × 0.40 × 1.00 = 3.800,0000
```

Định mức gốc trên thành phẩm vẫn 1,03.

Không trừ MC/nhũ khỏi `G`. Chỉ trừ **nhựa**.

## F.5 Chốt lệnh và kho

- **Nháp:** không trừ kho.  
- **Chốt:** trừ từng vật liệu có sl > 0.  
- Thiếu hàng: **cảnh báo, vẫn cho chốt**.  
- Tồn không âm:

```
Trừ thực tế = nhỏ hơn giữa (tồn hiện tại, nhu cầu)
Phiếu xuất  = trừ thực tế
Cột thiếu trên lệnh = nhu cầu − trừ thực tế
```

Thành phẩm **không** cộng kho.

Huỷ lệnh đã chốt: chỉ Superadmin, cộng trả kho đúng số đã trừ.

## F.6 Gắn đơn bán — giá trị đã thực hiện

Khi gắn dòng đơn bán, lưu **đơn giá dòng đó** (`salesUnitPrice`) trên lệnh.

```
Giá trị lệnh này = sản lượng lệnh × salesUnitPrice
```

Không dùng thành tiền dòng đã cộng VAT/chiết khấu.

Lệnh **không gắn đơn**: vẫn trừ kho; **không** cộng báo cáo theo dõi đơn.

---

# G. Bán hàng

## G.1 Một đơn bán **[ĐÃ CÓ]**

Nhiều dòng sản phẩm. Mỗi dòng:

```
Nền          = sl × đơn giá
Cộng thêm    = VAT hoặc “khác”: số tiền, hoặc % của Nền
Trừ          = chiết khấu: số tiền, hoặc % của Nền
Thành tiền dòng = Nền + VAT/khác − chiết khấu
```

```
Tổng đơn (totalAmount) = cộng mọi thành tiền dòng
Đã thu                 = cộng các lần thanh toán
                       (nếu chưa có lịch sử: lấy paidAmount + cọc cũ)
Công nợ đơn            = max(0, Tổng đơn − Đã thu)
```

Trạng thái **theo tiền** (trừ khi Huỷ):

```
Chưa thu gì              → Draft
Đã thu một phần          → Đang thực hiện
Đã thu ≥ tổng đơn        → Hoàn thiện
                         (so sánh có dung sai 0,5 đồng)
```

Công nợ khách khi lưu đơn:

```
Nợ khách mới = Nợ khách cũ − nợ đơn cũ + nợ đơn mới
Đã mua       = Đã mua cũ − tổng đơn cũ + tổng đơn mới
```

## G.2 Kho khi chốt đơn bán

**Hiện tại [ĐÃ CÓ]:** trừ kho theo công thức `sl vật liệu = quantityPerUnit × sl dòng`. Thiếu thì **chặn** chốt.

**Sau khi có SX [ĐỔI]:**

- Không trừ kho khi chốt / sửa trạng thái đơn bán  
- Không chặn chốt vì thiếu NVL  
- Đơn cũ đã trừ: giữ nguyên, không trừ thêm  

## G.3 Báo cáo theo dõi đơn hàng **[SẼ LÀM]**

Mỗi đơn bán không huỷ:

```
Giá trị đơn hàng     = totalAmount
Giá trị đã thực hiện = tổng (sản lượng lệnh SX đã chốt gắn đơn × đơn giá đã lưu trên lệnh)
Giá trị còn lại      = Giá trị đơn − Đã thực hiện
```

- Còn lại **dương**: chưa làm đủ  
- Còn lại **âm**: SX vượt kế hoạch (cho phép)  
- Chưa có lệnh SX: đã thực hiện = 0, còn lại = giá trị đơn  

**Ví dụ:** đơn 20.000.000, đơn giá 1.000.000/tấn.  
Lệnh 1: 10 tấn → đã thực hiện 10.000.000, còn lại 10.000.000.  
Lệnh 2: 15 tấn → đã thực hiện 25.000.000, còn lại **−5.000.000**.

---

# H. Tổng kết (báo cáo)

## H.1 Theo kỳ — bán **[ĐÃ CÓ]**

Kỳ: ngày (0:00–23:59) / tuần (T2–CN) / tháng / năm.

Đơn trong kỳ (bỏ nháp, huỷ):

```
Doanh số      = tổng totalAmount
Đã thanh toán = tổng đã thu
Công nợ kỳ    = tổng nợ trên các đơn kỳ đó
Công nợ chung = tổng totalDebt mọi khách
```

## H.2 Khách hàng **[ĐÃ CÓ]**

Danh sách + nợ. Chi tiết: đã mua, công nợ, đơn đã mua, phiếu thu đã ghi.

## H.3 Nhà cung cấp **[SẼ LÀM]**

Bảng: NCC | Nợ đầu | Nhập mua | Trả tiền | Nợ cuối  
Bấm một NCC: phát sinh trong kỳ (chốt đơn = nhập mua; lần chuyển = trả tiền).  
Công thức: mục D.8.

## H.4 Kho theo kỳ **[SẼ LÀM]**

Cột: Vật liệu | Đầu | Nhập | Xuất | Cuối. Công thức: mục E.4.

## H.5 Theo dõi đơn bán **[SẼ LÀM]**

Cột: Đơn | Giá trị đơn | Đã thực hiện | Còn lại. Công thức: mục G.3.

---

# I. Menu sau này **[SẼ LÀM]**

Tổng quan · Bán hàng · Mua hàng · Sản xuất · Kho · Tổng kết · Cài đặt

Cài đặt thêm tab **Nhà cung cấp**. Sản phẩm thêm định mức % / kiểu tính.

---

# J. Việc không làm trong đợt này

- Lệnh sản xuất kiểu “nhiều thành phẩm một lệnh”
- Kho thành phẩm, xuất kho khi giao hàng
- Đơn mua nhiều vật liệu, VAT đơn mua
- Đổi bán hàng theo file bạn gửi sau (ngoài việc bỏ trừ kho)
- Chuyển phiếu nhập kho lẻ cũ (`contractor` gõ tay) thành NCC

---

# K. Checklist rà soát (bạn đánh dấu)

Đánh **Đúng / Sai / Sửa** từng dòng:

1. Một đơn mua = 1 NCC + 1 vật liệu.  
2. Thành tiền mua = sl × đơn giá; không VAT.  
3. Còn lại mua = tổng đơn (gồm số dư chuyển vào) − đã chuyển − số dư chuyển đi.  
4. Nhận hàng mới cộng kho; chốt đơn mua chỉ ghi nợ, chưa cộng kho.  
5. Cho chuyển tiền vượt; không cho nhận vượt sl đặt.  
6. Đóng đơn: chọn chuyển số dư sang đơn sau (chờ nếu chưa có đơn) hoặc để trên đơn cũ.  
7. Sổ NCC: nhập mua = thành tiền đơn chốt trong kỳ, **không** cộng số dư chuyển.  
8. `%` nhập 5.2 = 5,2% (÷ 100).  
9. Đá = (sản lượng − sl nhựa) × % × hệ số (mặc định 1,03, sửa được), tròn 4 số.  
10. Nhựa / dầu / than = sản lượng × %, tròn 2 số. Không trừ MC/nhũ khi tính đá.  
11. MC, nhũ gõ tay, không làm tròn.  
12. Chốt SX trừ kho; thiếu vẫn cho chốt; tồn không âm.  
13. Thành phẩm không nhập kho.  
14. Đơn bán không trừ kho.  
15. Đã thực hiện đơn bán = sl SX × đơn giá dòng (không gồm VAT dòng). Còn lại được âm.  
16. Báo cáo kho kỳ: đầu + nhập − xuất = cuối.
