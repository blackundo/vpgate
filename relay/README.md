# BillGate VPBank Relay

Relay chạy trên một VPS nhỏ có IP outbound khác để BillGate gọi API VPBank khi IP máy chủ chính bị WAF chặn. Service bắt buộc shared secret và chỉ chuyển tiếp request HTTPS đến các hostname VPBank được cho phép, vì vậy không hoạt động như open proxy.

## Yêu cầu

- VPS Ubuntu/Debian có public IP chưa bị VPBank chặn.
- Docker và Docker Compose.
- Một subdomain trỏ về VPS nhỏ, ví dụ `relay.example.com`.
- Cổng TCP `80` và `443` mở cho Caddy.

## 1. Cài relay nhanh

```bash
git clone https://github.com/blackundo/vpgate.git
cd vpgate/relay
cp .env.example .env
openssl rand -hex 32
```

Mở `.env`, dán chuỗi vừa tạo vào `RELAY_SECRET` và chỉ bind relay vào localhost:

```env
RELAY_SECRET=thay-bang-chuoi-openssl-vua-tao
RELAY_PORT=8787
RELAY_BIND_IP=127.0.0.1
```

Khởi động và kiểm tra:

```bash
docker compose up -d --build
curl http://127.0.0.1:8787/health
```

Kết quả đúng:

```json
{"status":"ok"}
```

Kiểm tra relay không bị public trực tiếp:

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Port đúng phải có dạng:

```text
vpbank-relay   127.0.0.1:8787->8787/tcp
```

Nếu vẫn hiện `0.0.0.0:8787`, recreate container sau khi sửa `.env`:

```bash
docker compose up -d --force-recreate
```

## 2. Trỏ DNS

Tạo bản ghi DNS `A`:

```text
Type: A
Name: relay
Value: PUBLIC_IP_VPS_NHO
```

Ví dụ kết quả là `relay.example.com`. Nếu dùng Cloudflare, nên để **DNS only** trong lúc Caddy cấp chứng chỉ lần đầu.

## 3. Mở firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Không cần mở port `8787` ra Internet vì Caddy sẽ truy cập relay qua localhost.

## 4. Cài Caddy trên Ubuntu/Debian

```bash
sudo apt install --yes debian-keyring debian-archive-keyring apt-transport-https curl

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list

sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install --yes caddy
```

## 5. Cấu hình Caddy HTTPS

Mở file:

```bash
sudo nano /etc/caddy/Caddyfile
```

Thay `relay.example.com` bằng domain thật:

```caddy
relay.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

Kiểm tra và áp dụng:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

Caddy sẽ tự xin và gia hạn chứng chỉ TLS khi domain trỏ đúng IP và cổng `80/443` truy cập được.

Kiểm tra từ Internet:

```bash
curl https://relay.example.com/health
```

Kết quả phải là:

```json
{"status":"ok"}
```

### Nếu Caddy báo port 443 đang được sử dụng

```text
listen tcp :443: bind: address already in use
```

Tìm tiến trình đang chiếm port trước khi dừng bất kỳ dịch vụ nào:

```bash
sudo ss -ltnp | grep ':443'
sudo lsof -iTCP:443 -sTCP:LISTEN
```

Nếu VPS đang có Nginx, Apache, một Caddy khác hoặc chương trình Python phục vụ HTTPS, hãy xác định nó còn được dùng hay không. Chỉ dừng đúng service sau khi đã xác minh, rồi restart Caddy:

```bash
sudo systemctl restart caddy
```

Xem log khi cần:

```bash
sudo journalctl -u caddy -n 100 --no-pager
```

## 6. Bật relay trên BillGate

1. Mở `https://DOMAIN_BILLGATE/relay`.
2. Nhập **Relay URL**: `https://relay.example.com`.
3. Nhập **Relay secret** đúng với `RELAY_SECRET` trên VPS nhỏ.
4. Bật **VPBank Relay**.
5. Bấm **Lưu cấu hình**.
6. Bấm **Kiểm tra relay**.

Khi kiểm tra thành công, API server và Temporal worker sẽ tự dùng relay ở lần gọi VPBank tiếp theo; không cần restart BillGate.

## 7. Đổi sang VPS relay khác

Trên VPS mới, lặp lại các bước trên với secret mới. Sau đó chỉ cần đổi Relay URL và secret tại trang `/relay` của BillGate. Tài khoản, webhook và lịch sử giao dịch không cần di chuyển.

## Vận hành

```bash
# Xem trạng thái
docker compose ps

# Xem log
docker compose logs -f --tail=100

# Cập nhật code và rebuild
git pull
docker compose up -d --build

# Restart
docker compose restart
```

Không dùng proxy công cộng hoặc URL HTTP qua Internet: request relay chứa Key Share, PIN Share và token VPBank.
