# An Phát — Tóm tắt vận hành

Bốn phần: **Mua hàng → Kho → Sản xuất → Bán hàng**.  
Kho chỉ giữ **vật liệu**. Thành phẩm không nhập kho (trộn xong dùng/giao luôn).

```
NCC  --mua-->  KHO vật liệu  --SX trừ-->  thành phẩm  --bán-->  khách
                 ↑ nhập kho lẻ (không bắt buộc đơn mua)
```

---

## 1. Mua hàng

**Một đơn = một nhà cung cấp + một vật liệu.**

| Ô trên đơn | Công thức |
|---|---|
| Thành tiền | sl đặt × đơn giá |
| Tổng tiền đơn | thành tiền + số dư chuyển vào từ đơn trước |
| Tiền đã chuyển | cộng các lần chuyển |
| Còn lại (tiền) | tổng tiền đơn − đã chuyển − số dư đã chuyển đi |
| Sl đã nhận | cộng các lần nhận hàng |
| Còn nhận | sl đặt − sl đã nhận |

**Làm việc**

1. Chốt đơn → ghi nợ NCC (thành tiền). Nháp chưa ghi sổ.
2. Nhận hàng (từng đợt, không vượt sl đặt) → **cộng kho**.
3. Chuyển tiền (từng đợt, cho phép chuyển quá) → giảm còn lại.
4. Đóng đơn. Nếu còn số dư (nợ hoặc trả thừa), hỏi: **chuyển sang đơn sau?**
   - Có → giữ chờ trên NCC; đơn mua kế **cùng NCC** khi chốt sẽ cộng vào.
   - Không → số dư đứng trên đơn này.
5. Chuyển số dư **không** tính là mua mới (tránh cộng tiền hai lần trên sổ).

**Sổ NCC theo kỳ**

| Cột | Nghĩa |
|---|---|
| Nợ đầu | nợ cũ + mua trước kỳ − trả trước kỳ |
| Nhập mua | thành tiền các đơn **chốt trong kỳ** (không kể số dư chuyển) |
| Trả tiền | các lần chuyển trong kỳ |
| Nợ cuối | nợ đầu + nhập mua − trả tiền |

---

## 2. Kho

Chỉ vật liệu. Tồn tăng khi **nhận đơn mua** hoặc **nhập kho lẻ**. Tồn giảm khi **chốt lệnh SX**.

**Báo cáo kỳ — từng vật liệu**

| Cột | Nghĩa |
|---|---|
| Đầu kỳ | tồn lúc bắt đầu kỳ |
| Số nhập | nhập trong kỳ |
| Xuất | xuất trong kỳ (chủ yếu SX) |
| Tồn cuối | đầu + nhập − xuất |

---

## 3. Sản xuất

Chọn **thành phẩm + sản lượng**. Có thể gắn **một dòng đơn bán**, hoặc không gắn.  
Vật liệu lấy từ danh mục Kho. Mỗi dòng một kiểu tính. `%` nhập `5.2` = 5,2% (nhân ÷ 100).

**Thứ tự tính:** nhựa → dầu/than → đá → MC/nhũ (số gõ tay).

| Nhóm | Công thức | Làm tròn |
|---|---|---|
| Nhựa | sản lượng × % | 2 số |
| Dầu, than | sản lượng × % | 2 số |
| Đá | (sản lượng − sl nhựa) × % × hệ số đá | 4 số |
| MC, nhũ | tự nhập | không làm tròn |

Hệ số đá mặc định **1,03**, chỉ cho đá, **có ô sửa** trên lệnh.

**Ví dụ** sản lượng 10.000; nhựa 5%; đá 40%; than 1%; hệ số 1,03

- Nhựa = 10.000 × 5% = **500,00**
- Đá = (10.000 − 500) × 40% × 1,03 = **3.914,0000**
- Than = 10.000 × 1% = **100,00**

**Làm việc**

1. Nạp định mức từ thành phẩm; sửa % / hệ số / sl nhập tay trên lệnh nếu cần.
2. Thiếu hàng → **cảnh báo**, vẫn cho chốt.
3. **Chốt** → trừ kho (tồn không âm; thiếu thì trừ hết phần còn).
4. Thành phẩm **không** vào kho.
5. Nháp không trừ kho. Một đơn bán có thể gắn nhiều lệnh (SX nhiều đợt).

**Đơn bán không trừ kho** — chỉ lệnh SX trừ.

---

## 4. Bán hàng

Giữ như hiện tại về **tiền và khách** (đơn, thanh toán, công nợ).  
Không trừ kho khi chốt đơn.

**Theo dõi đơn (tiền)**

| Cột | Công thức |
|---|---|
| Giá trị đơn | tổng tiền đơn bán |
| Đã thực hiện | cộng (sl mỗi lệnh SX đã chốt × đơn giá dòng bán) |
| Còn lại | giá trị đơn − đã thực hiện (**được âm** nếu SX vượt) |

Lệnh không gắn đơn: trừ kho bình thường, **không** cộng vào báo cáo này.

---

## 5. Ai làm gì

| Việc | Ai trừ/cộng kho | Ai ghi tiền |
|---|---|---|
| Chốt đơn mua | — | Nợ NCC tăng |
| Nhận hàng mua | Cộng kho | — |
| Chuyển tiền NCC | — | Nợ NCC giảm |
| Chốt lệnh SX | Trừ kho | Cộng “đã thực hiện” nếu gắn đơn bán |
| Chốt đơn bán | Không đụng kho | Công nợ khách |

Admin/Superadmin được ghi. Viewer chỉ xem.
