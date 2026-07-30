# AN PHÁT — Quản lý nhà máy Asphalt

Web app (tiếng Việt) quản lý vật liệu, công thức, bán hàng, kho và tổng kết cho nhà máy **Asphalt An Phát**.

## Chạy local

```bash
npm install
cp .env.example .env   # điền Firebase config
npm run dev
```

## Firebase cần bật

Xem chi tiết: [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)

1. **Authentication** → Sign-in method → **Email/Password**
2. **Firestore** → Rules → Publish (dán rules tạm hoặc file `firestore.rules`)
3. Authentication → Settings → Authorized domains → thêm domain Vercel
4. Tài khoản **đầu tiên đăng ký** = **Superadmin**
5. Superadmin đổi quyền user khác: Cài đặt → Tài khoản

## Modules

- **Cài đặt**: vật liệu, quy đổi, công thức, khách hàng (+ Excel), công ty, webhook n8n, tài khoản
- **Bán hàng**: tính nhanh / bán khách / danh sách đơn (khoá sau xác nhận)
- **Kho**: bento tồn kho + phiếu nhập (SL, chi phí, nhà thầu, thời gian)
- **Tổng kết**: ngày / tuần (T2–CN) / tháng / năm + công nợ + theo khách
- **Phân quyền**: Superadmin · Admin · Viewer (chỉ xem)

## Deploy hosting (tùy chọn)

```bash
npm run build
# deploy thư mục dist lên Firebase Hosting / Vercel / Netlify
```
