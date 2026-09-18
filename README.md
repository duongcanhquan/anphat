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

## Deploy Vercel

App là Vite SPA. Vercel build `npm run build`, output `dist`, rewrite SPA đã có trong `vercel.json`.

1. [vercel.com](https://vercel.com) → **Add New → Project** → chọn repo GitHub `anphat` (branch `main`).
2. Framework Preset: **Vite**. Root Directory: để trống (repo chính là app).
3. **Settings → Environment Variables** (Production + Preview), cùng tên với `.env.example`:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
VITE_PHOTO_WORKER_URL=https://anphat-photos.duongcanhquan.workers.dev
```

Biến `VITE_*` được **nướng lúc build**. Đổi URL ảnh / Firebase xong phải **Redeploy**.

4. Firebase Console → Authentication → Settings → **Authorized domains** → thêm:
   - `localhost`
   - domain Vercel (`….vercel.app`) và domain riêng nếu có
5. Publish Firestore rules (`firestore.rules`) — collection `supplierPayments` và `fuelReadings`.
6. Mỗi push `main` Vercel tự build bản mới.

Chạy local không cần Vercel: `cp .env.example .env` rồi `npm run dev`.
