# Cấu hình Firebase cho AN PHÁT (bắt buộc)

Nếu sau đăng nhập / đăng ký báo **Missing or insufficient permissions** hoặc màn hình trống,
nguyên nhân gần như chắc chắn là **Firestore Rules chưa được Publish**.

## 1. Bật Authentication

1. Mở https://console.firebase.google.com/project/asphalt-b1181/authentication/providers  
2. Bật **Email/Password**

## 2. Thêm domain Vercel (Auth)

1. Authentication → Settings → **Authorized domains**  
2. Thêm: `anphat-blush.vercel.app` (và domain custom nếu có)

## 3. Publish Firestore Rules (quan trọng nhất)

### Cách nhanh (tạm thời — để app chạy ngay)

1. Mở https://console.firebase.google.com/project/asphalt-b1181/firestore/rules  
2. **Xoá hết** nội dung hiện tại, dán:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. Bấm **Publish**
4. Quay lại app → Đăng xuất → Đăng ký / Đăng nhập lại

> Rules tạm thời: mọi user đã đăng nhập đều đọc/ghi được. Phù hợp lúc mới setup (≤10 người).

### Cách chuẩn (sau khi app đã chạy)

Dùng nội dung file `firestore.rules` trong repo → dán vào Console → **Publish**.

## 4. Kiểm tra Firestore Database

Đảm bảo đã tạo database (Production mode hoặc Test mode đều được, miễn rules đã Publish như trên).

Collections sẽ tự tạo khi dùng app: `users`, `materials`, `orders`, …
