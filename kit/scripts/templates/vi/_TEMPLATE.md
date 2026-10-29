---
id: 2026-09-24-be-slug-ngan-gon
title: "Tiêu đề ngắn gọn của thay đổi / vấn đề"
module: general
from: be
author: "@handle"
type: feature
priority: normal
created: 2026-09-24
refs: [XYZ-FE-003, PR-47]
targets:
  fe: pending
---
<!--
Mẫu sync note. Nên tạo bằng lệnh (tự điền frontmatter, id, ngày):
  node sync/scripts/sync.mjs new --module <module> --from <side> --to <side[,side]> --type <type> --slug <kebab-case> --title "..."
Giá trị hợp lệ của từng trường: xem sync/README.md § Frontmatter. Không để comment inline trong frontmatter.
Xoá các mục không áp dụng, nhưng luôn giữ mục "Thảo luận".
-->

## Tóm tắt

1–3 câu: cái gì thay đổi / vấn đề gì, và vì sao bên nhận cần quan tâm.

## Chi tiết

- Với `feature` / `breaking` / `bugfix` / `deprecation`: mô tả hành vi mới, bối cảnh.
- Với `bug-report`: bước tái hiện, kết quả mong đợi vs thực tế, request/response thật (ẩn token).
- Với `question`: câu hỏi cụ thể, các phương án đang cân nhắc.

## Contract (trước → sau)

| | Trước | Sau |
| --- | --- | --- |
| Interface | — | `PATCH /tasks/:id` |
| Đầu vào | — | `{ title?: string, ... }` |
| Đầu ra | — | `{ data: Task }` |
| Lỗi | — | `404 TASK_NOT_FOUND` |

## Việc bên nhận cần làm

- [ ] FE: ...

## Cách kiểm tra

Lệnh / màn hình / request mẫu để bên nhận tự xác nhận thay đổi đã chạy.

## Thảo luận

<!-- Mỗi lần đổi trạng thái của mình trong `targets`, thêm 1 entry ở CUỐI mục này (không sửa entry của người khác):
### [FE] 2026-09-25 @handle — acked
Đã đọc, dự kiến làm trong XYZ-FE-004.
### [FE] 2026-09-27 @handle — applied
Đã áp dụng ở PR-52 (commit abc1234).
-->
