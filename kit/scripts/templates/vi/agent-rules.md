## Giao thức sync note (sync-kit)

Dự án này ghi các thay đổi liên quan nhiều side vào sync note trong `sync/`. Các side: {{sides}}. Giao thức đầy đủ: `sync/README.md`.

1. Trước khi bắt đầu task, đọc `sync/INBOX.md` và tìm các note liên quan tới những side mà task của bạn chạm tới.
2. Nếu có note liên quan tới việc bạn làm, cập nhật `targets` và thêm entry của bạn vào mục Thảo luận. Không sửa phần thuộc side khác.
3. Khi bạn đổi file khớp các contract glob bên dưới, tạo note bằng `node sync/scripts/sync.mjs new` (cách dùng: `sync/README.md`) để các side khác biết.
4. Sau khi sửa bất kỳ thứ gì trong `sync/`, chạy `node sync/scripts/sync.mjs inbox` và commit inbox sinh ra nếu inbox được theo dõi bởi git.
5. Báo cho người dùng mọi note có priority `blocker` hoặc `high` đang chờ một side.
6. Trong báo cáo cuối, nêu các sync note bạn đã tạo hoặc đã sửa.

Contract glob (đổi file ở đây cần có sync note):

{{contract}}
