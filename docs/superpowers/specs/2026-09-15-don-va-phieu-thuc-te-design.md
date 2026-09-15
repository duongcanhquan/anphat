# Đơn hàng + Phiếu thực tế (Mua / Bán / SX)

Ngày: 2026-09-15  
Trạng thái: đã triển khai

## Mô hình

- **Đơn** = khung cam kết (có ngày).
- **Phiếu thực tế** = giao dịch ngày, có/không gắn đơn; gắn đơn thì trừ lũy kế **cả tiền và khối lượng**.

## Mua hàng

- Đơn: Số tiền đặt (`orderAmount`), đơn giá, sl tính (`plannedQty = tiền÷ĐG`), Khối lượng kế hoạch (`plannedWeight`), ngày đơn.
- Tab **Nhập thực tế** (`purchaseReceipts`): tick theo đơn → trừ lũy kế trên đơn + cộng kho; không gắn → mua lẻ + nợ NCC.
- Chuyển tiền chẵn giữ `payments[]`.

## Bán hàng

- Đơn: chọn/tạo khách inline, SP, sl, ĐG, ngày đơn.
- Tab **Xuất bán thực tế** (`salesDeliveries`): tick theo đơn → trừ lũy kế sl+tiền dòng đơn; không gắn → bán lẻ + nợ khách.
- Không trừ kho vật liệu ở bước xuất bán.

## Sản xuất

- Thêm tên khách, tick theo đơn bán, ngày SX (`producedAt`).
- Công thức tiêu hao giữ như cũ; chốt trừ kho VT.
