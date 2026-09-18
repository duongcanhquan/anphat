# Ảnh đồng hồ dầu → Cloudflare R2

Bucket: `anphat` (APAC)  
Worker: https://anphat-photos.duongcanhquan.workers.dev

```bash
npx wrangler login
cd workers/photos
npx wrangler secret put FIREBASE_WEB_API_KEY   # API key web Firebase (tuỳ chọn)
npx wrangler deploy
```

Trong `.env` app:

```
VITE_PHOTO_WORKER_URL=https://anphat-photos.duongcanhquan.workers.dev
```

Không có biến này: vẫn nhập/chụp + trừ kho, chỉ không lưu file ảnh.
