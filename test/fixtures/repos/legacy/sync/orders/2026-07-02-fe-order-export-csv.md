---
id: 2026-07-02-fe-order-export-csv
title: Xuất CSV danh sách đơn hàng
module: orders
from: fe
author: "@bob"
type: feature
priority: normal
created: 2026-07-02
refs: [XYZ-FE-005]
targets:
  be: applied
---

## Thảo luận

### [FE] 2026-07-02 @bob — raised
Cần endpoint trả CSV.

### [BE] 2026-07-06 @alice — applied (XYZ-BE-030)
`GET /orders/export.csv`, PR-88.

### [FE] 2026-07-07 @bob — verified
