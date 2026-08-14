# ArchSync Phase 1–3 — Demo Guide

Tài liệu này hướng dẫn demo từ **Phase 1: Architecture Model and Benchmark Lab**, **Phase 2: Deterministic Guardian Core** đến **Phase 3: Git Diff and Pull-Request Gate** trên Windows PowerShell.

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
10. Đo analyzer trên 20 thay đổi code và 40 tín hiệu detector bằng precision, recall, specificity, classification và determinism.
11. Chỉ phân tích các component bị Git diff tác động, tái sử dụng baseline graph được cache.
12. Sinh GitHub annotation, Markdown report và merge decision cho pull request.

> **Phạm vi hiện tại:** Phase 1, Phase 2 và deterministic core của Phase 3 đã hoàn thành. Guardian có thể phân tích toàn repository hoặc Git diff, sinh source annotation và trả exit code để CI gate quyết định `PASS`, `BLOCK` hoặc `REVIEW`. ArchSync không tự chấp nhận evolution và không tự cập nhật `architecture.yaml`.

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
pnpm build

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

Các lệnh Core bên dưới gọi bản CLI đã build bằng `node dist/bin.js`. Cách này giữ
nguyên exit code dành cho automation nhưng không thêm thông báo `ELIFECYCLE` của
pnpm khi một fixture cố ý bị từ chối.

## 2. Câu mở đầu

Có thể giới thiệu như sau:

> ArchSync biến kiến trúc từ tài liệu tĩnh thành một hợp đồng sống nhưng có kiểm soát. Phase 1 tạo Expected Architecture Graph từ `architecture.yaml`. Phase 2 dùng Guardian để đọc source TypeScript và tạo Observed Graph. Phase 3 chạy vòng kiểm soát đó trên từng Git diff: code lệch hard rule bị block, topology mới phải review, và baseline chỉ đổi sau khi kiến trúc được phê duyệt.

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
        ↓
Git diff + cached baseline
        ↓
PR annotation + CI merge gate
```

## 3. Demo mô hình hợp lệ

Chạy:

```powershell
cd "D:\Little Boys\ArchSync\archsync-core"
node dist/bin.js validate test/fixtures/order-platform.architecture.yaml
```

Kết quả mong đợi:

```text
RESULT: VALID
FILE: ...order-platform.architecture.yaml
SUMMARY: 5 components, 5 relationships
```

Giải thích:

> Mô hình order platform có 5 component và 5 relationship. ArchSync đã kiểm tra cả cấu trúc schema lẫn tính hợp lệ của các tham chiếu giữa component.

## 4. Demo phát hiện relationship sai

Thông báo trước khi chạy:

> Lệnh tiếp theo được thiết kế để thất bại nhằm chứng minh ArchSync có thể chặn một quan hệ kiến trúc không hợp lệ.

Chạy:

```powershell
node dist/bin.js validate test/fixtures/invalid-unknown-component.architecture.yaml
```

Kết quả mong đợi:

```text
RESULT: INVALID
FILE: ...invalid-unknown-component.architecture.yaml

PROBLEMS (1)
1. Unknown component 'missing-database'
   Location: relationships[0].to (/relationships/0/to)
   Fix: Add 'missing-database' under components, or change this reference to an existing component.

NEXT STEP: Fix the listed problems, then run validation again.
EXIT CODE: 1 (INVALID)
```

Giải thích:

> Relationship đang trỏ đến `missing-database`, nhưng component này không tồn tại. ArchSync chỉ rõ cả vị trí dễ đọc `relationships[0].to`, JSON Pointer `/relationships/0/to`, cách sửa và exit code 1 để CI/CD có thể chặn thay đổi.

## 4A. Demo lỗi kiến trúc thực sự

Fixture tiếp theo **đúng schema** và có đầy đủ component hợp lệ, nhưng topology của nó vi phạm contract mong muốn:

```powershell
node dist/bin.js check `
  test/fixtures/order-platform.architecture.yaml `
  test/fixtures/order-platform.violation.architecture.yaml
```

Kết quả mong đợi:

```text
DECISION: BLOCK
REASON: 2 architecture rules are violated. Fix the violations before merging.

RULE VIOLATIONS (2)
1. [ARCH-001] Forbidden dependency detected
   Relationship: frontend --http--> payment-service
   Fix: Remove or reroute this dependency.
2. [ARCH-004] Required dependency is missing
   Relationship: order-service --http--> payment-service
   Fix: Restore the required dependency.

ARCHITECTURE CHANGES (2)
1. ADDED relationship: frontend --http--> payment-service
2. REMOVED relationship: order-service --http--> payment-service

NEXT STEP: Fix the rule violations, then run this check again.
EXIT CODE: 1 (BLOCK)
```

Giải thích:

> Observed Architecture đã cho Frontend gọi trực tiếp Payment Service, đồng thời làm mất cạnh bắt buộc từ Order Service tới Payment Service. Đây mới là lỗi kiến trúc: YAML vẫn hợp lệ nhưng graph vi phạm `ARCH-001` và `ARCH-004`.

Lệnh trả exit code 1 có chủ đích để CI có thể block.

Sinh báo cáo draw.io tô đỏ lỗi:

```powershell
node dist/bin.js report `
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
node dist/bin.js check `
  test/fixtures/order-platform.architecture.yaml `
  test/fixtures/order-platform.evolution.architecture.yaml
```

Kết quả là `EVOLUTION`, exit code 3: Redis và cạnh mới được phát hiện nhưng cần kiến trúc sư phê duyệt, không được tự động coi là hợp lệ.

## 5. Demo phát hiện sai schema

Chạy:

```powershell
node dist/bin.js validate test/fixtures/invalid-schema.architecture.yaml
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
node dist/bin.js graph test/fixtures/order-platform.architecture.yaml
```

Kết quả trả về gồm:

- `nodes`: danh sách 5 component.
- `edges`: danh sách 5 quan hệ có `from`, `to`, `type` và key ổn định.

Giải thích:

> Đây là biểu diễn graph chuẩn của kiến trúc mong muốn. Guardian dùng graph này làm Expected Model để so sánh với kiến trúc thực tế được phát hiện từ source code.

### Demo Graph Diff bằng input giả lập

```powershell
node dist/bin.js diff `
  test/fixtures/minimal.architecture.yaml `
  test/fixtures/minimal-evolution.architecture.yaml
```

Kết quả mong đợi cho thấy `redis` và edge `api|data|redis` được thêm. Đây là demo riêng của primitive Graph Diff trong Core; phần Guardian bên dưới sẽ tạo Observed Graph trực tiếp từ source code.

## 7. Demo sinh sơ đồ tự động

### Mermaid

```powershell
node dist/bin.js mermaid `
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
node dist/bin.js drawio `
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
- deterministic: 20/20 cases
```

Benchmark gồm 20 patch độc lập:

- 9 `no-impact`.
- 7 `violation`.
- 4 `evolution`.

Mỗi patch được áp lên một bản sao sạch của baseline. Guardian phân tích source sau patch và so sánh kết quả với ground truth. Vì vậy metric đo output thực tế của analyzer, không chỉ kiểm tra dữ liệu khai báo.

## 12. Demo Phase 3 — Git diff và pull-request gate

Ba lệnh sau tạo repository Git tạm từ cùng baseline, áp patch thật, chạy một lần cache miss và một lần cache hit, rồi tự xóa thư mục tạm:

```powershell
cd "D:\Little Boys\ArchSync\archsync-benchmark"

# Internal refactor, topology không đổi
pnpm demo:phase3:pass

# Frontend bypass Payment Service
pnpm demo:phase3:block

# Order Service thêm Redis
pnpm demo:phase3:review
```

Các quyết định mong đợi:

```text
case-01 -> PASS
case-06 -> BLOCK, ARCH-001 tại frontend/src/app.ts:14:26
case-09 -> REVIEW, Redis tại order-service/src/cache.ts:12:9
```

Mỗi output cũng hiển thị số component được phân tích, số file TypeScript thực sự được parse, trạng thái baseline cache và architecture delta. Wrapper demo trả thành công khi quyết định thực tế khớp ground truth; trong pull request thật, Guardian trực tiếp trả exit `1` cho `BLOCK` và exit `3` cho `REVIEW`.

CLI dùng trong một repository Git thật:

```powershell
pnpm guardian check architecture.yaml . `
  --diff main `
  --github `
  --report archsync-pr-report.md
```

Workflow GitHub Actions mẫu nằm tại `archsync-guardian/docs/examples/github-actions/architecture-gate.yml`. File `architecture.yaml` phải được bảo vệ bằng CODEOWNERS hoặc policy tương đương; đây là phần bắt buộc để code không thể tự hợp thức hóa bằng cách âm thầm sửa kiến trúc mong đợi.

Kết quả benchmark Phase 3 trên 20 patch:

- `20/20` classification và merge decision đúng.
- `20/20` changed-file set đúng.
- `20/20` architecture delta đúng với ground truth.
- `20/20` kết quả incremental tương đương với full scan độc lập trên cùng head repository.
- `7/7` violation rule-set đúng.
- `11/11` finding-bearing case đúng file và dòng evidence.
- `20/20` lần chạy lặp lại dùng cache và giữ nguyên normalized result.
- Incremental analyzer parse `57/189` lượt file TypeScript (`0.3016`).
- Trên máy evidence Windows đã ghi nhận: cold median/p95 `540.00/571.60 ms`; warm median/p95 `249.75/278.27 ms`.

Các latency trên chỉ là phép đo của máy và corpus đã ghi trong evidence, không phải tuyên bố performance tổng quát.

## 13. Demo các exit gate

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

### Guardian — Phase 3

```powershell
cd "D:\Little Boys\ArchSync\archsync-guardian"
pnpm phase3:verify
```

Gate kiểm tra Phase 2 cùng Git diff, feature-branch merge base, cache miss/hit, incremental graph merge, pre-existing/resolved findings, GitHub annotations, Markdown report, coverage và Phase 3 evidence.

### Benchmark tích hợp

```powershell
cd "D:\Little Boys\ArchSync\archsync-benchmark"
pnpm verify
```

Gate kiểm tra model, ground truth, 20 patch, 40 tín hiệu detector, SHA-256 integrity, mutation tests, Phase 2 full scans, 40 Phase 3 cold/warm Git-diff checks và 20 full-scan oracle. Tổng cộng Phase 3 thực hiện 80 analyzer calls để chứng minh incremental result không chỉ ổn định mà còn tương đương full scan.

## 14. Câu kết thúc

> Phase 1 biến `architecture.yaml` thành Expected Architecture Graph. Phase 2 biến source TypeScript thành Observed Graph có evidence. Phase 3 nối hai phần vào Git diff và CI: rule violation bị block, topology evolution phải review, còn refactor nội bộ được pass. Kiến trúc “động” ở chỗ Observed Graph được dựng lại liên tục theo code; Expected Graph không chạy theo code sai mà chỉ đổi sau phê duyệt.

Có thể tuyên bố ArchSync hiện đã:

- Phân tích toàn bộ repository TypeScript/Node.js bằng các detector được hỗ trợ.
- Phân loại `no-impact`, `violation` và `evolution`.
- Trả quyết định `PASS`, `BLOCK` hoặc `REVIEW`.
- Chỉ ra file, dòng, cột, detector và confidence của source evidence.
- Kiểm tra deterministic rule `deny`, `allow`, `require` và `require-path`.
- Phân tích Git diff theo component, cache baseline graph và không block PR vì finding cũ không liên quan.
- Sinh GitHub annotation, Markdown PR report và exit code cho CI merge gate.

Chưa nên tuyên bố ArchSync đã:

- Được đánh giá tổng quát trên nhiều repository thực tế hoặc nhiều ngôn ngữ.
- Tự động đăng PR comment, tự phê duyệt evolution hoặc tự merge.
- Phân tích Terraform, Kubernetes hoặc runtime telemetry.
- Dùng AI để tự sửa code hoặc tự cập nhật architecture baseline.

Các khả năng này nằm ngoài deterministic Phase 3 hiện tại.

## 15. Kịch bản demo nhanh trong 2–3 phút

Nếu thời gian ngắn, chạy bốn lệnh sau:

```powershell
# 1. Git diff chỉ refactor nội bộ -> PASS
cd "D:\Little Boys\ArchSync\archsync-benchmark"
pnpm demo:phase3:pass

# 2. Git diff làm Frontend gọi tắt Payment Service -> BLOCK + file:line
pnpm demo:phase3:block

# 3. Git diff thêm Redis -> REVIEW
pnpm demo:phase3:review

# 4. Chứng minh trên toàn bộ 20 Git-diff case
pnpm phase3:verify
```

Ba câu cần nhấn mạnh:

1. `architecture.yaml` là Expected Architecture đã được phê duyệt.
2. Observed Architecture được suy ra từ source, không phải người dùng nhập tay.
3. ArchSync phân biệt lỗi phải block với thay đổi kiến trúc cần con người review.
4. `architecture.yaml` không bao giờ bị tự động sửa để chạy theo code sai.

## 16. Xử lý nhanh khi demo gặp lỗi

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
node dist/bin.js drawio test/fixtures/order-platform.architecture.yaml order-platform-demo.drawio
Invoke-Item .\order-platform-demo.drawio
```

### Fixture `invalid-*` hoặc demo violation hiển thị exit code khác 0

Đây có thể là hành vi mong đợi:

- Model/usage không hợp lệ: exit `2` trong Guardian.
- `no-impact`: exit `0`.
- `violation`: exit `1`.
- `evolution`: exit `3`.

Hai fixture `invalid-*` được tạo để chứng minh validator từ chối input sai. Hai script `demo:case06` và `demo:case09` tự xác nhận kết quả mong đợi nên bản thân wrapper sẽ kết thúc thành công khi demo đúng.
