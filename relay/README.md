# BillGate VPBank Relay

Service nhỏ chạy trên VPS có IP outbound chưa bị VPBank WAF chặn. Relay chỉ cho phép request HTTPS đến các hostname VPBank đã khai báo và bắt buộc shared secret; đây không phải open proxy.

## Cài bằng Docker

```bash
git clone https://github.com/blackundo/vpgate.git
cd vpgate/relay
cp .env.example .env
openssl rand -hex 32
# Dán kết quả vào RELAY_SECRET trong .env
docker compose up -d --build
curl http://127.0.0.1:8787/health
```

Mở TCP port `8787` trên firewall chỉ cho IP của VPS BillGate nếu có thể. Khuyến nghị đặt relay sau HTTPS (Nginx/Caddy) và nhập URL dạng `https://relay.example.com` trên dashboard. Nếu dùng trực tiếp `http://IP:8787`, Key Share/PIN Share sẽ không được mã hóa trên đường truyền nên chỉ dùng qua mạng riêng/VPN.

Sau khi chạy, vào **VPBank Relay** trên BillGate, nhập URL và đúng `RELAY_SECRET`, bật relay, lưu rồi bấm **Kiểm tra relay**.
