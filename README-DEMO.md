# ArchSync Phase 1–2 — Demo Guide

Tài liệu này hướng dẫn demo từ **Phase 1: Architecture Model and Benchmark Lab** đến **Phase 2: Deterministic Guardian Core** trên Windows PowerShell.

Mục tiêu của demo là chứng minh ArchSync có thể:

1. Đọc kiến trúc từ `architecture.yaml`.
2. Chấp nhận mô hình hợp lệ và từ chối mô hình sai với thông báo rõ ràng.
3. Chuyển mô hình thành graph.
4. Sinh sơ đồ Mermaid và draw.io tự động.
5. Kiểm tra bộ benchmark có ground truth và patch hợp lệ.
6. Chạy toàn bộ cổng kiểm tra Phase 1.
7. Phân biệt model sai schema với kiến trúc đúng schema nhưng vi phạm rule.
8. Phân tích source TypeScript để tự động tạo Observed Graph.
9. Trả về quyết định `PASS`, `BLOCK` hoặc `REVIEW` kèm đúng file và dòng code.
10. Đo analyzer trên 10 thay đổi code bằng precision, recall, classification và determinism.

> **Phạm vi hiện tại:** Phase 1 và Phase 2 đã hoàn thành. Guardian có thể phân tích toàn bộ repository TypeScript/Node.js để tạo Observed Graph và phát hiện drift. Phân tích riêng Git diff, comment pull request và merge gate thuộc Phase 3.

## 1. Chuẩn bị

Yêu cầu:

- Node.js 22 trở lên.
- pnpm 11 trở lên.
- draw.io Desktop nếu muốn mở file `.drawio`.
- Workspace nằm tại `D:\Little Boys\ArchSync`.
- Ba repository `archsync-core`, `archsync-guardian` và `archsync-benchmark` nằm cạnh nhau trong workspace.

Mở PowerShell và cài dependency cho ba repository dùng trong demo:

```powershell
cd "D:\Little Boys\ArchSync\archsync-core"
pnpm install --frozen-lockfile

cd "D:\Little Boys\ArchSync\archsync-guardian"
pnpm install --frozen-lockfile

cd "D:\Little Boys\ArchSync\archsync-benchmark"
pnpm install --frozen-lockfile
```

Kiểm tra phiên bản công cụ nếu cần:

```powershell
node --version
pnpm --version
```

## 2. Câu mở đầu

Có thể giới thiệu như sau:

> ArchSync biến kiến trúc từ tài liệu tĩnh thành một hợp đồng có thể kiểm tra tự động. Phase 1 tạo Expected Architecture Graph từ `architecture.yaml`. Phase 2 dùng Guardian để đọc source TypeScript, tạo Observed Graph, so sánh hai graph và chỉ ra chính xác file, dòng code gây vi phạm hoặc kiến trúc mới cần review.

Luồng xử lý:

```text
architecture.yaml
        ↓
Schema + Semantic Validation
        ↓
Expected Architecture Graph
        ↘
          Core Conformance ──→ PASS / BLOCK / REVIEW
        ↗                         + Finding file:line
TypeScript source
        ↓
Guardian AST Analyzer
        ↓
Observed Architecture Graph
```

## 3. Demo mô hình hợp lệ

Chạy:

```powershell
cd "D:\Little Boys\ArchSync\archsync-core"
pnpm arch:model validate test/fixtures/order-platform.architecture.yaml
```

Kết quả mong đợi:

```text
VALID ...order-platform.architecture.yaml (5 components, 5 relationships)
```

Giải thích:

> Mô hình order platform có 5 component và 5 relationship. ArchSync đã kiểm tra cả cấu trúc schema lẫn tính hợp lệ của các tham chiếu giữa component.

## 4. Demo phát hiện relationship sai

Thông báo trước khi chạy:

> Lệnh tiếp theo được thiết kế để thất bại nhằm chứng minh ArchSync có thể chặn một quan hệ kiến trúc không hợp lệ.

Chạy:

```powershell
pnpm arch:model validate test/fixtures/invalid-unknown-component.architecture.yaml
```

Kết quả mong đợi:

```text
INVALID ...invalid-unknown-component.architecture.yaml
- /relationships/0/to: Unknown component 'missing-database'
[ELIFECYCLE] Command failed with exit code 1.
```

Giải thích:

> Relationship đang trỏ đến `missing-database`, nhưng component này không tồn tại. ArchSync chỉ rõ vị trí `/relationships/0/to` và trả exit code 1 để CI/CD có thể chặn thay đổi.

`ELIFECYCLE` trong trường hợp này là kết quả mong đợi, không phải lỗi của buổi demo.

## 4A. Demo lỗi kiến trúc thực sự

Fixture tiếp theo **đúng schema** và có đầy đủ component hợp lệ, nhưng topology của nó vi phạm contract mong muốn:

```powershell
pnpm arch:model check `
  test/fixtures/order-platform.architecture.yaml `
  test/fixtures/order-platform.violation.architecture.yaml
```

Kết quả mong đợi:

```text
VIOLATION (2 violations, 2 architecture changes)
- [ARCH-001] ERROR deny-rule ... frontend|http|payment-service
- [ARCH-004] ERROR required-edge ... order-service|http|payment-service ... missing
DELTA nodes +0/-0/~0, edges +1/-1
```

Giải thích:

> Observed Architecture đã cho Frontend gọi trực tiếp Payment Service, đồng thời làm mất cạnh bắt buộc từ Order Service tới Payment Service. Đây mới là lỗi kiến trúc: YAML vẫn hợp lệ nhưng graph vi phạm `ARCH-001` và `ARCH-004`.

Lệnh trả exit code 1 có chủ đích để CI có thể block.

Sinh báo cáo draw.io tô đỏ lỗi:

```powershell
pnpm arch:model report `
  test/fixtures/order-platform.architecture.yaml `
  test/fixtures/order-platform.violation.architecture.yaml `
  docs/demo/order-platform-violation-report.drawio

Invoke-Item .\docs\demo\order-platform-violation-report.drawio
```

Màu sắc trong report:

- Đỏ: rule violation hoặc required edge bị thiếu.
- Cam: topology evolution cần approval.
- Xám nét đứt: component/relationship bị loại bỏ.

Demo evolution không vi phạm deterministic rule:

```powershell
pnpm arch:model check `
  test/fixtures/order-platform.architecture.yaml `
  test/fixtures/order-platform.evolution.architecture.yaml
```

Kết quả là `EVOLUTION`, exit code 3: Redis và cạnh mới được phát hiện nhưng cần kiến trúc sư phê duyệt, không được tự động coi là hợp lệ.

## 5. Demo phát hiện sai schema

Chạy:

```powershell
pnpm arch:model validate test/fixtures/invalid-schema.architecture.yaml
```

Kết quả mong đợi bao gồm các lỗi tại:

```text
/version
/components
/components/Bad_Component_ID/type
/components/Bad_Component_ID/layer
/relationships
```

Giải thích:

> ArchSync không chỉ báo file không hợp lệ mà còn chỉ ra từng trường cần sửa như version, component ID, type, layer và relationships. Lệnh này cũng chủ động trả exit code 1.

## 6. Demo Expected Architecture Graph

Chạy:

```powershell
pnpm arch:model graph test/fixtures/order-platform.architecture.yaml
```

Kết quả trả về gồm:

- `nodes`: danh sách 5 component.
- `edges`: danh sách 5 quan hệ có `from`, `to`, `type` và key ổn định.

Giải thích:

> Đây là biểu diễn graph chuẩn của kiến trúc mong muốn. Guardian dùng graph này làm Expected Model để so sánh với kiến trúc thực tế được phát hiện từ source code.

### Demo Graph Diff bằng input giả lập

```powershell
pnpm arch:model diff `
  test/fixtures/minimal.architecture.yaml `
  test/fixtures/minimal-evolution.architecture.yaml
```

Kết quả mong đợi cho thấy `redis` và edge `api|data|redis` được thêm. Đây là demo riêng của primitive Graph Diff trong Core; phần Guardian bên dưới sẽ tạo Observed Graph trực tiếp từ source code.

## 7. Demo sinh sơ đồ tự động

### Mermaid

```powershell
pnpm arch:model mermaid `
  test/fixtures/order-platform.architecture.yaml `
  order-platform-demo.mmd
```

Kết quả mong đợi:

```text
WROTE ...order-platform-demo.mmd
```

Không mở file `.mmd` bằng `File > Open` trong draw.io. `.mmd` là mã nguồn Mermaid, không phải XML của draw.io.

### draw.io chỉnh sửa trực tiếp

```powershell
pnpm arch:model drawio `
  test/fixtures/order-platform.architecture.yaml `
  order-platform-demo.drawio
```

Mở file vừa tạo:

```powershell
Invoke-Item .\order-platform-demo.drawio
```

Giải thích:

> Mermaid và draw.io đều được sinh từ cùng một `architecture.yaml`. Khi kiến trúc thay đổi, chúng ta tạo lại sơ đồ thay vì cập nhật tài liệu thủ công.

## 8. Demo Guardian đọc source code thật

Chuyển sang Guardian và kiểm tra repository baseline của Order Platform:

```powershell
cd "D:\Little Boys\ArchSync\archsync-guardian"

pnpm guardian check `
  "..\archsync-benchmark\order-platform\architecture.yaml" `
  "..\archsync-benchmark\order-platform\repository"
```

Kết quả mong đợi:

```text
NO-IMPACT / PASS (0 violations, 0 architecture changes)
- No source-level architecture drift detected
OBSERVED 5 components, 5 relationships, 9 TypeScript files
```

Giải thích:

> Guardian vừa đọc 9 file TypeScript bằng TypeScript Compiler API, phát hiện 5 component và 5 relationship rồi so sánh với `architecture.yaml`. Hai graph khớp nhau nên kết quả là `PASS`. Observed Graph này không phải fixture viết tay.

Nếu muốn lưu Observed Graph thành JSON:

```powershell
pnpm guardian scan `
  "..\archsync-benchmark\order-platform\architecture.yaml" `
  "..\archsync-benchmark\order-platform\repository" `
  observed-order-platform.json
```

Guardian Phase 2 hiện nhận diện các tín hiệu TypeScript/Node.js sau:

- `fetch()` tới HTTP(S).
- PostgreSQL qua `pg`.
- Redis qua `redis`.
- AMQP publish/consume qua `amqplib`.

## 9. Demo vi phạm từ thay đổi code — `BLOCK`

Chạy case 06. Script sẽ sao chép baseline, áp patch thật rồi phân tích source sau thay đổi:

```powershell
cd "D:\Little Boys\ArchSync\archsync-benchmark"
pnpm demo:case06
```

Kết quả quan trọng:

```text
CASE case-06: Frontend bypasses order flow
VIOLATION / BLOCK (1 violations, 1 architecture changes)
- [ARCH-001] ERROR deny-rule at frontend/src/app.ts:14:26: Forbidden relationship 'frontend|http|payment-service' matches deny rule 'ARCH-001'
OBSERVED 5 components, 6 relationships, 9 TypeScript files
DEMO MATCH case-06: violation
```

Lời giải thích đề xuất:

> Patch thêm lời gọi trực tiếp từ Frontend sang Payment Service. Guardian phát hiện cạnh `frontend|http|payment-service`, Core đối chiếu với `ARCH-001`, và Finding chỉ đúng `frontend/src/app.ts`, dòng 14, cột 26. Vì đây là rule violation nên quyết định là `BLOCK`.

`demo:case06` trả thành công khi kết quả thực tế khớp ground truth. Lệnh `guardian check` trực tiếp trên source vi phạm sẽ trả exit code `1` để CI có thể block.

## 10. Demo kiến trúc mới hợp lệ — `REVIEW`

Chạy case 09:

```powershell
pnpm demo:case09
```

Kết quả quan trọng:

```text
CASE case-09: Add Redis order cache
EVOLUTION / REVIEW (0 violations, 2 architecture changes)
- [EVOLUTION-001] WARNING architecture-evolution ... Component 'redis' was added ...
- [EVOLUTION-002] WARNING architecture-evolution ... Relationship 'order-service|data|redis' was added ...
OBSERVED 6 components, 6 relationships, 10 TypeScript files
DEMO MATCH case-09: evolution
```

Lời giải thích đề xuất:

> Guardian phát hiện Redis và relationship mới từ source code. Thay đổi này không vi phạm rule, nhưng làm kiến trúc khác baseline đã được phê duyệt. ArchSync không tự động cho qua hoặc tự sửa `architecture.yaml`; nó trả `REVIEW` để kiến trúc sư quyết định.

Lệnh `guardian check` trực tiếp cho architecture evolution trả exit code `3`.

## 11. Demo benchmark Phase 2

Chạy evaluator để xem toàn bộ metric:

```powershell
cd "D:\Little Boys\ArchSync\archsync-guardian"

pnpm guardian benchmark `
  "..\archsync-benchmark\order-platform\ground-truth.json"
```

Kết quả mong đợi:

```text
VALID PHASE 2 BENCHMARK order-platform
- baseline: 5 components, 5 relationships, no-impact
- full graph nodes: precision 1.000, recall 1.000, F1 1.000
- full graph edges: precision 1.000, recall 1.000, F1 1.000
- changed nodes: precision 1.000, recall 1.000, F1 1.000
- changed edges: precision 1.000, recall 1.000, F1 1.000
- classification accuracy: 1.000
- source evidence: file 1.000, exact line 1.000
- deterministic: 10/10 cases
```

Benchmark gồm 10 patch độc lập:

- 5 `no-impact`.
- 3 `violation`.
- 2 `evolution`.

Mỗi patch được áp lên một bản sao sạch của baseline. Guardian phân tích source sau patch và so sánh kết quả với ground truth. Vì vậy metric đo output thực tế của analyzer, không chỉ kiểm tra dữ liệu khai báo.

## 12. Demo các exit gate

### Core — Phase 1

```powershell
cd "D:\Little Boys\ArchSync\archsync-core"
pnpm phase1:verify
```

Gate kiểm tra type, test, coverage, fixture, build, CLI smoke và Phase 1 evidence.

### Guardian — Phase 2

```powershell
cd "D:\Little Boys\ArchSync\archsync-guardian"
pnpm phase2:verify
```

Gate kiểm tra analyzer, Finding/Observed Graph contracts, bốn loại rule (`deny`, `allow`, `require`, `require-path`), coverage, CLI và evidence.

### Benchmark tích hợp

```powershell
cd "D:\Little Boys\ArchSync\archsync-benchmark"
pnpm verify
```

Gate kiểm tra model, ground truth, 10 patch, SHA-256 integrity, mutation tests và chạy lại analyzer trên toàn bộ 10 case.

## 13. Câu kết thúc

> Phase 1 biến `architecture.yaml` thành Expected Architecture Graph có thể validation, diff và trực quan hóa. Phase 2 biến source TypeScript thành Observed Graph, so sánh hai phía và trả Finding có bằng chứng tới đúng dòng code. Trên benchmark chuẩn, Guardian đạt 10/10 case và precision/recall bằng 1.000 cho cả node lẫn edge.

Có thể tuyên bố ArchSync hiện đã:

- Phân tích toàn bộ repository TypeScript/Node.js bằng các detector được hỗ trợ.
- Phân loại `no-impact`, `violation` và `evolution`.
- Trả quyết định `PASS`, `BLOCK` hoặc `REVIEW`.
- Chỉ ra file, dòng, cột, detector và confidence của source evidence.
- Kiểm tra deterministic rule `deny`, `allow`, `require` và `require-path`.

Chưa nên tuyên bố ArchSync đã:

- Chỉ phân tích phần Git diff của pull request.
- Tự động đăng comment hoặc chặn merge trên GitHub pull request.
- Phân tích Terraform, Kubernetes hoặc runtime telemetry.
- Dùng AI để tự sửa code hoặc tự cập nhật architecture baseline.

Các khả năng này nằm ngoài Phase 2.

## 14. Kịch bản demo nhanh trong 2–3 phút

Nếu thời gian ngắn, chạy bốn lệnh sau:

```powershell
# 1. Source baseline khớp kiến trúc -> PASS
cd "D:\Little Boys\ArchSync\archsync-guardian"
pnpm guardian check "..\archsync-benchmark\order-platform\architecture.yaml" "..\archsync-benchmark\order-platform\repository"

# 2. Frontend gọi tắt Payment Service -> BLOCK + file:line
cd "D:\Little Boys\ArchSync\archsync-benchmark"
pnpm demo:case06

# 3. Thêm Redis -> REVIEW
pnpm demo:case09

# 4. Chứng minh trên toàn bộ 10 case
cd "D:\Little Boys\ArchSync\archsync-guardian"
pnpm guardian benchmark "..\archsync-benchmark\order-platform\ground-truth.json"
```

Ba câu cần nhấn mạnh:

1. `architecture.yaml` là Expected Architecture đã được phê duyệt.
2. Observed Architecture được suy ra từ source, không phải người dùng nhập tay.
3. ArchSync phân biệt lỗi phải block với thay đổi kiến trúc cần con người review.

## 15. Xử lý nhanh khi demo gặp lỗi

### `pnpm` không được nhận diện

```powershell
corepack enable
corepack prepare pnpm@11.16.0 --activate
```

### Thiếu dependency

Chạy trong đúng repository đang demo:

```powershell
pnpm install --frozen-lockfile
```

### Không tải được dependency từ repository private

Đăng nhập GitHub CLI và cấu hình Git dùng credential hiện tại:

```powershell
gh auth login
gh auth setup-git
```

Sau đó chạy lại `pnpm install --frozen-lockfile`.

### draw.io báo `Start tag expected, '<' not found`

Bạn đã mở nhầm file `.mmd`. Hãy tạo và mở file `.drawio`:

```powershell
cd "D:\Little Boys\ArchSync\archsync-core"
pnpm arch:model drawio test/fixtures/order-platform.architecture.yaml order-platform-demo.drawio
Invoke-Item .\order-platform-demo.drawio
```

### Fixture `invalid-*` hoặc demo violation hiển thị exit code khác 0

Đây có thể là hành vi mong đợi:

- Model/usage không hợp lệ: exit `2` trong Guardian.
- `no-impact`: exit `0`.
- `violation`: exit `1`.
- `evolution`: exit `3`.

Hai fixture `invalid-*` được tạo để chứng minh validator từ chối input sai. Hai script `demo:case06` và `demo:case09` tự xác nhận kết quả mong đợi nên bản thân wrapper sẽ kết thúc thành công khi demo đúng.
