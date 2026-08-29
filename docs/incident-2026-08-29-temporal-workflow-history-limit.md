# Báo cáo sự cố giao dịch bị treo ngày 29/08/2026

## Tóm tắt

- Tài khoản bị ảnh hưởng: `01A0-05F8-B9CF-717A` (`XXXXXX6839`).
- Workflow Temporal: `vpbank-account-01A0-05F8-B9CF-717A`.
- Nguyên nhân: lịch sử workflow vượt giới hạn của Temporal (`Workflow history count exceeds limit`).
- Hậu quả: workflow bị đóng; FCM vẫn nhận thông báo nhưng không signal được vào workflow, với lỗi `WorkflowNotFoundError: workflow execution already completed`.
- Webhook không phải điểm gây treo. Giao dịch chưa đi tới bước dispatch webhook vì workflow đã đóng.

## Dòng thời gian

Thời gian dưới đây dùng múi giờ Việt Nam (UTC+7):

- Khoảng `08:36`: Temporal báo `Workflow history count exceeds limit`; workflow của tài khoản `01A0...717A` ngừng xử lý.
- `11:24`, `11:43`, `21:30`, `22:12`: FCM nhận thông báo nhưng signal thất bại do workflow đã hoàn tất.
- Khoảng `23:39`: restart riêng `vpbank-server` để chạy lại cơ chế restore workflow.
- Khoảng `23:41`: workflow mới được tạo và chạy startup reconciliation.
- Startup reconciliation tìm thấy và lưu 4 giao dịch còn chờ, sau đó dispatch webhook thành công.

## Giao dịch được khôi phục

| Thời gian giao dịch | Transaction ID | Số tiền | Kết quả webhook |
|---|---|---:|---|
| 11:24 | `92fcbe044f116a364d6f8c68632128c4` | 130.000 VND | 3 webhook đều HTTP 200 |
| 11:43 | `f4c9a0d0a35b36118e81df7221683e29` | 55.000 VND | 3 webhook đều HTTP 200 |
| 21:30 | `eeda4a68ff07bfacf97672410b62150e` | 55.000 VND | 3 webhook đều HTTP 200 |
| 22:12 | `0975749a796f762ffeeca747fadcde38` | 130.000 VND | 3 webhook đều HTTP 200 |

Sau reset, `vpbank-server` healthy và `vpbank-worker` vẫn hoạt động. Không thấy `Webhook failed`, `WorkflowNotFoundError`, lỗi history-limit mới hoặc lỗi xử lý giao dịch trong khoảng xác minh sau reset.

## Lệnh reset đã chạy

Chỉ restart server ứng dụng. Không restart worker, Temporal hoặc PostgreSQL; không xóa hay sửa dữ liệu:

```sh
docker compose restart vpbank-server
```

`vpbank-server` gọi `vpbankService.init()` khi khởi động và restore các session đang `active`. Vì run cũ đã hoàn tất, Temporal cho phép tạo run mới với cùng workflow ID. Workflow mới chạy `startup` reconciliation để bắt kịp giao dịch bị thiếu.

## Các lệnh kiểm tra đã chạy

Kiểm tra container và lọc luồng FCM, sync, workflow, webhook từ đầu ngày:

```sh
docker compose ps
docker compose logs --since='2026-08-29T00:00:00+07:00' --no-color vpbank-worker vpbank-server 2>&1 \
  | rg -i 'WebhookService|Dispatching webhooks|FCM.*Received|Processing sync trigger|Synchronizing transactions|Sync completed|SyncTransactions|Activity.*(failed|timeout)|Workflow.*(failed|error)|ECONN|ETIMEDOUT|ENOTFOUND|legal HTTP|statusCode.*[45][0-9]{2}' \
  | tail -n 1200
```

Kiểm tra timestamp của workflow, lỗi signal và lỗi webhook:

```sh
docker compose logs --since='2026-08-29T00:00:00+07:00' -t --no-color vpbank-worker 2>&1 \
  | rg -i '01A0-05F8-B9CF-717A.*(already completed|Failed to signal|FCM event received|Sync completed|Workflow.*(completed|ending|continue|close)|Items=|newTransactions=)|Received notification keyShare=01A0|WebhookService.*(result|failed)|Dispatching webhooks for account: 01A0' \
  | tail -n 500

docker compose logs --since='2026-08-29T00:00:00+07:00' -t --no-color vpbank-worker 2>&1 \
  | rg -i '(WorkflowNotFoundError|workflow execution already completed|Webhook failed|"status":"failed"|Activity.*failed|SyncTransactions.*Error)' \
  | tail -n 300
```

Kiểm tra đoạn log quanh thời điểm history vượt giới hạn:

```sh
docker compose logs --since='2026-08-29T08:25:00+07:00' --until='2026-08-29T08:45:00+07:00' -t --no-color vpbank-worker vpbank-server 2>&1 \
  | rg -i -C 4 '01A0-05F8-B9CF-717A|delete signal|Stopping FCM|terminated|pause|stop|error|failed'
```

Kiểm tra cơ chế workflow và restore trong mã nguồn:

```sh
sed -n '1,240p' server/src/temporal/workflows/account.workflow.ts
sed -n '1,140p' server/src/services/workflow.service.ts
sed -n '190,250p' server/src/services/vpbank.service.ts
sed -n '60,105p' server/src/index.ts
```

Xác minh sau reset:

```sh
docker compose ps vpbank-server vpbank-worker
docker compose logs --since=5m -t --no-color vpbank-server vpbank-worker 2>&1 \
  | rg -i 'Restored workflow|Workflow started|startup|newTransactions|Dispatching webhooks|Webhook result|Webhook failed|already running|01A0-05F8-B9CF-717A|error|failed' \
  | tail -n 500

docker compose logs --since='2026-08-29T23:41:30+07:00' -t --no-color vpbank-worker 2>&1 \
  | rg '\[WebhookService\] Webhook result:' \
  | rg '0975749a796f762ffeeca747fadcde38|eeda4a68ff07bfacf97672410b62150e|f4c9a0d0a35b36118e81df7221683e29|92fcbe044f116a364d6f8c68632128c4'
```

## Khắc phục lâu dài

Đã bổ sung `continueAsNew` sau mỗi 500 lần reconciliation (khoảng 16 giờ 40 phút với chu kỳ 2 phút). Workflow chỉ chuyển run khi hàng đợi FCM trong bộ nhớ đang trống. Run mới giữ nguyên session và thực hiện startup reconciliation, nên giao dịch đến sát thời điểm chuyển run vẫn được đối soát từ ngân hàng và xử lý idempotent qua database.
