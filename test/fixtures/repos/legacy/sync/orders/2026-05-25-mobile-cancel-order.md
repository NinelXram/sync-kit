---
id: 2026-05-25-mobile-cancel-order
title: API huỷ đơn trả lỗi 500
module: orders
from: mobile
author: "@dave"
type: bug-report
priority: high
created: 2026-05-25
refs: [XYZ-MB-007]
targets:
  be: pending
---

Gọi `POST /orders/:id/cancel` khi đơn đã giao thì trả 500.
