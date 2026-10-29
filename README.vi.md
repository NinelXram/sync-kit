# sync-kit

*[English](README.md) · Tiếng Việt*

Một engine Node không phụ thuộc thư viện nào, kèm bộ prompt chia phase, để bất kỳ AI coding agent nào (Claude Code,
Codex, Cursor, Gemini, Copilot, …) cài luồng **sync note** vào một repository có sẵn.

## Vấn đề

Khi nhiều bên cùng làm một sản phẩm — backend, web, mobile, QA — phần lớn lỗi xảy ra *giữa* các bên: một endpoint đổi
cấu trúc, một enum thêm giá trị, một bug nằm trong phần việc của bên khác. Tin nhắn chat thì trôi, ticket thì nằm
trong backlog riêng của từng team, và không ai trả lời được "bên mình còn việc gì đang chờ?".

Một **sync note** là một file markdown trong repository, báo **một** thay đổi hoặc vấn đề ảnh hưởng tới các bên khác.
Mỗi bên nhận có trạng thái riêng trong note, và mỗi lần đổi trạng thái thì thêm một entry ngắn vào mục Thảo luận của
note. Engine sinh INBOX cho từng bên, kiểm tra note trong CI, gửi tin vào kênh chat khi có sự kiện và gửi tin nhắc việc
theo lịch.

```
pending ──► acked ──► applied
   │          │
   └──► disputed ◄──┘      (phản hồi → bên raise trả lời → bên nhận chuyển sang acked / applied / n/a)
   └──► n/a                (không ảnh hưởng bên này — ghi lý do)
```

Note đóng khi mọi bên nhận đều `applied` hoặc `n/a`. Quy tắc đầy đủ: [docs/protocol.md](docs/protocol.md)
(tiếng Anh).

## Bắt đầu nhanh

Tại thư mục gốc của repository đích (cần Node ≥ 18 và git):

```
git clone -b v1.0.0 --depth 1 https://github.com/NinelXram/sync-kit.git .sync-kit
```

Thêm `.sync-kit/` vào `.gitignore` của repository. Sau đó mở agent tại thư mục gốc repository và dán nội dung
`.sync-kit/prompts/00-discover.md`. Khi cổng kiểm tra của phase đạt, chuyển sang prompt tiếp theo. Chi tiết (cài bằng
tarball, Codex cloud, agent không chạy được lệnh): [prompts/README.md](prompts/README.md).

## Các phase

| Phase | Prompt | Việc diễn ra | Cổng kiểm tra |
| --- | --- | --- | --- |
| 00 | `prompts/00-discover.md` | khảo sát chỉ đọc; đề xuất sides, modules, contract globs, CI và kênh; bạn duyệt | `doctor --phase 00` |
| 01 | `prompts/01-install.md` | `sync.mjs install` chép engine vào `sync/scripts/`, ghi `sync/sync.config.json`, chạy `init`, viết luật riêng của project | `doctor --phase 01` (gồm hash engine) |
| 02 | `prompts/02-agent-rules.md` | thêm khối luật có marker vào các file agent bạn dùng (`CLAUDE.md`, `AGENTS.md`, …) | `doctor --phase 02` |
| 03 | `prompts/03-ci.md` | GitHub Actions, GitLab CI (gồm tự host) hoặc hook pre-commit | `doctor --phase 03` |
| 04 | `prompts/04-notify.md` | Telegram, Google Chat hoặc none; chạy thử dry-run | `doctor --phase 04` |
| 05 | `prompts/05-rollout.md` | note thật đầu tiên, hướng dẫn một trang cho team, kế hoạch pilot | `doctor` |

Prompt phụ trong `prompts/extras/`: `upgrade`, `add-side`, `add-module`, `pause-side`, `adopt-existing` (repository đã
có note làm tay), `uninstall`.

Mỗi phase kết thúc bằng một lệnh kiểm tra tất định (`node sync/scripts/sync.mjs doctor --phase NN`), không dựa vào
việc agent tự thấy ổn. Tiến độ được ghi trong `sync/.kit/state.json`, nên với agent chạy local mỗi phase có thể chạy ở một phiên mới; agent
cloud (Codex cloud, Claude Code web) phải chạy mọi phase trong một task, hoặc commit và push kết quả mỗi phase (kể cả
`sync/.kit/`) trước task tiếp theo.

## Những gì được cài

- `sync/scripts/` — engine: `install`, `state`, `init`, `new`, `inbox`, `check`, `contract-check`, `notify`,
  `remind`, `agent-rules`, `doctor`, `version`. Chỉ được cài bằng `sync.mjs install` và được kiểm sha256 theo
  `MANIFEST.json`; agent không bao giờ viết lại.
- `sync/sync.config.json` — file duy nhất riêng cho từng project ([docs/config.md](docs/config.md)).
- `sync/README.md` (giao thức cho team), `sync/_TEMPLATE.md`, `sync/INBOX.md`, các thư mục note.
- Job CI / hook từ `kit/ci/`, và một khối luật trong file agent.

File sinh ra bằng tiếng Anh hoặc tiếng Việt (`lang` trong config). Prompt luôn bằng tiếng Anh.

## Yêu cầu

- Node.js ≥ 18 (trên máy và trên runner CI). Không có dependency npm.
- git.
- Với CI: GitHub Actions, hoặc GitLab ≥ 13.7 (gitlab.com hoặc tự host). Không có CI thì dùng hook pre-commit và
  thông báo bị tắt.

## Hỏi đáp

**Vì sao dùng file trong git thay vì issue tracker?** Note đi cùng thay đổi code trong cùng một pull request, được
review cùng lúc và CI kiểm tra được. Mọi bên, và mọi coding agent, đọc được note ngay cả khi offline, không cần quyền
vào tracker của team khác. Note trỏ tới ticket qua `refs`; nó không thay thế backlog của ai.

**Nhiều repository?** v1 hỗ trợ một repository chứa nhiều bên (`monorepo`) hoặc một codebase với các vai trò quanh nó
như dev và QA (`single`). Contract nằm ở một repository hub riêng dự kiến có ở v1.1.

**Tắt thông báo thế nào?** Đặt `"channel": "none"` trong mục `notify` của `sync/sync.config.json` và ghi lại bằng
`node sync/scripts/sync.mjs state decide --channel none`. Job CI vẫn chạy nhưng không gửi gì (với `none`, tin chỉ
được in ra log của job). Muốn tạm tắt một bên, thêm bên đó vào `paused` (`prompts/extras/pause-side.md`).

**Note cũ có bị kiểm tra chặt không?** Không. Kiểm tra chặt chỉ áp dụng cho note tạo từ ngày `strict.since` (ngày cài)
trở đi. Xem [docs/protocol.md](docs/protocol.md#strict-checks).

## Tài liệu

Tài liệu chi tiết viết bằng tiếng Anh:

- [docs/protocol.md](docs/protocol.md) — giao thức sync note (độc lập ngôn ngữ)
- [docs/config.md](docs/config.md) — `sync/sync.config.json`
- [docs/state.md](docs/state.md) — `sync/.kit/state.json` và `doctor`
- [docs/design-decisions.md](docs/design-decisions.md) — vì sao kit được thiết kế như vậy
- [docs/field-tests.md](docs/field-tests.md) — các lần chạy trên repository thật
- [prompts/README.md](prompts/README.md) — cách dùng prompt
- [CHANGELOG.md](CHANGELOG.md)

## Phát triển kit

```
npm test
npm run e2e
npm run lint:prompts
```

Sau mọi thay đổi trong `kit/scripts/`, chạy `node scripts/build-manifest.mjs`.

## Giấy phép

MIT — xem [LICENSE](LICENSE).
