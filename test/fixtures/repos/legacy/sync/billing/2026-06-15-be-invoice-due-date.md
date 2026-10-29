---
id: 2026-06-15-be-invoice-due-date
title: Hoá đơn có thêm hạn thanh toán
module: billing
from: be
author: "@alice"
type: feature
priority: normal
created: 2026-06-15
refs: [XYZ-BE-021]
targets:
  fe: applied
  qa: pending
---

## Tóm tắt

Response hoá đơn có thêm `dueDate` (ISO date).

## Thảo luận

### [BE] 2026-06-15 @alice — raised
Đã có trên staging.

### [FE] 2026-06-18 @bob — applied (XYZ-FE-001)
Hiển thị hạn thanh toán ở chi tiết hoá đơn.

### [QA] 2026-06-19 @carol — retested trên staging, chờ bản release
