# Sync — kênh đồng bộ giữa các bên

Nơi các bên của dự án báo cho nhau mọi thay đổi hoặc vấn đề **ảnh hưởng tới bên khác**, rồi theo dõi đến khi từng
bên đã xử lý xong. Mỗi thay đổi hoặc vấn đề là 1 **sync note** (1 file markdown). Mỗi bên nhận có trạng thái riêng
trong note đó.

- Sync note chỉ là **lớp giao tiếp giữa các bên**: nó trỏ tới task/PR qua `refs`, không thay thế backlog của từng bên.
- Việc gì đang chờ bên nào: xem [INBOX.md](INBOX.md) (sinh tự động).

## Thiết lập dự án

<!-- sync-kit:generated:start -->
<!-- sync-kit:generated:end -->

## Cấu trúc

```
sync/
  README.md          # file này — giao thức
  INBOX.md           # sinh tự động: việc đang chờ của từng bên — KHÔNG sửa tay
  INBOX-<SIDE>.md    # sinh tự động: việc chờ một bên tạm dừng (xem § Bên tạm dừng)
  _TEMPLATE.md       # mẫu 1 sync note
  sync.config.json   # các bên, module, mức strict, cấu hình thông báo
  scripts/sync.mjs   # init | new | inbox | check | ...
  <thư mục module>/  # note, mỗi module một thư mục (hoặc notes/ nếu bố cục phẳng)
    2026-09-24-be-task-patch-delete.md
```

Tên file = `id` = `<YYYY-MM-DD>-<bên raise>-<slug>`. Đặt theo ngày nên nhiều người tạo note song song trên nhiều
branch cũng không đụng số thứ tự.

## Khi nào phải tạo sync note

**Bắt buộc** khi thay đổi của bạn làm bên khác phải làm gì đó hoặc phải biết:

- đổi interface mà bên khác dùng (endpoint, payload, mã lỗi, enum, quyền, hành vi nhìn thấy được), fix bug làm đổi
  response, deprecate một thứ gì đó;
- phát hiện bug hoặc hành vi lạ ở phía bên khác (`bug-report`), cần bên khác làm thêm (`feature`), hoặc cần hỏi
  (`question`).

**Không cần** cho refactor nội bộ, test hay tài liệu không đổi contract.

## Frontmatter

| Trường | Giá trị |
| --- | --- |
| `id` | trùng tên file (không có `.md`), không đổi sau khi tạo |
| `title` | tiêu đề ngắn |
| `module` | một trong các module ở trên (`general` khi bố cục phẳng) |
| `from` | id bên raise |
| `author` | người raise |
| `type` | `feature` \| `breaking` \| `bugfix` \| `deprecation` \| `bug-report` \| `question` |
| `priority` | `blocker` \| `high` \| `normal` \| `low` |
| `created` | `YYYY-MM-DD` |
| `refs` | task/PR liên quan, vd `[XYZ-FE-003, PR-47]` |
| `targets` | map `bên: trạng thái` cho **mỗi bên nhận** (không gồm bên raise) |

### Trạng thái của mỗi bên nhận

```
pending ──► acked ──► applied
   │          │
   └──► disputed ◄──┘      (phản biện → bên raise trả lời → bên nhận chuyển lại acked/applied/n/a)
   └──► n/a                (không ảnh hưởng bên mình — ghi lý do)
```

| Trạng thái | Nghĩa | Ai đặt |
| --- | --- | --- |
| `pending` | chưa ai bên nhận đọc | bên raise, lúc tạo |
| `acked` | đã đọc, đồng ý, sẽ làm (ghi dự kiến task nào) | bên nhận |
| `applied` | đã làm xong ở phía mình (ghi PR/commit) | bên nhận |
| `disputed` | không đồng ý / cần làm rõ / phát hiện vấn đề ở thay đổi này | bên nhận |
| `n/a` | không liên quan tới bên mình (ghi lý do) | bên nhận |

Note **đóng** khi mọi bên nhận đều ở `applied` hoặc `n/a`. Note đã đóng vẫn giữ nguyên trong thư mục làm lịch sử.
Không xoá note.

### Bên tạm dừng

Bên nằm trong `paused` của `sync.config.json` đang tạm dừng phát triển. Note vẫn đặt `targets` cho bên đó, để khi
bật lại không sót việc. Trong lúc tạm dừng:

- `INBOX.md` không liệt kê việc của bên đó, chỉ ghi số note và trỏ sang `INBOX-<SIDE>.md` (danh sách đầy đủ);
- "Đang mở" trong `INBOX.md` không tính note chỉ còn chờ bên tạm dừng;
- nhắc định kỳ bỏ qua bên đó. Bỏ bên khỏi `paused` rồi chạy `sync.mjs inbox` để bật lại.

## Quy trình

1. **Raise.** Bên có thay đổi chạy:
   ```
   node sync/scripts/sync.mjs new --module <module> --from <side> --to <side[,side]> --type feature --slug task-patch-delete --title "Thêm PATCH/DELETE /tasks/:id" --refs "XYZ-FE-003"
   ```
   (bỏ `--module` khi bố cục phẳng). Điền các mục trong file, rồi chạy `node sync/scripts/sync.mjs inbox`. Commit
   note cùng PR của thay đổi. Một `bug-report` không gắn với PR code nào thì mở PR riêng chỉ chứa note đó và merge
   sớm.
2. **Nhận.** Trước khi bắt đầu task, mỗi bên xem mục của mình trong `INBOX.md`. Với mỗi note liên quan, đổi
   `targets.<bên mình>` và **thêm 1 entry vào cuối mục "Thảo luận"**:
   `### [FE] 2026-09-25 @handle — acked` + 1–3 dòng nội dung.
3. **Phản biện.** Đặt `disputed` kèm lý do cụ thể trong "Thảo luận". Bên raise trả lời bằng entry mới, và nếu cần
   thì sửa phần nội dung/contract trong note. Không sửa entry của người khác.
4. **Áp dụng.** Làm xong thì đổi sang `applied` và ghi PR/commit trong entry.
5. Sau mọi thay đổi trong `sync/`, chạy `node sync/scripts/sync.mjs inbox` và commit cả các file INBOX.

## Tự động hoá

- **CI kiểm tra** (chạy trên PR): `sync.mjs check` kiểm tra frontmatter, entry Thảo luận và các file INBOX đã cập
  nhật chưa. PR sửa file contract mà không kèm sync note chỉ bị cảnh báo.
- **Thông báo** (khi push lên nhánh chính): note mới, phản biện và note đã đóng được báo vào kênh cấu hình trong
  `sync.config.json` (`notify`).
- **Nhắc định kỳ** (theo lịch): bên nào còn note đang mở sẽ nhận bản tóm tắt các note gấp nhất.
- Thử trên máy mà không gửi thật: `node sync/scripts/sync.mjs notify --before HEAD~1 --after HEAD --dry-run`.

## Quy tắc riêng của dự án

<!-- sync-kit:project-rules:start -->
TODO: thay dòng này bằng quy tắc sync riêng của dự án (cái gì là contract, ai review, quy ước đặt tên). Xoá dòng này khi xong.
<!-- sync-kit:project-rules:end -->
