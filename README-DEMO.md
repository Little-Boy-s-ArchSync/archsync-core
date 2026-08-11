# ArchSync Phase 1 — Demo Guide

Tài liệu này hướng dẫn demo **Phase 1: Architecture Model and Benchmark Lab** trên Windows PowerShell.

Mục tiêu của demo là chứng minh ArchSync có thể:

1. Đọc kiến trúc từ `architecture.yaml`.
2. Chấp nhận mô hình hợp lệ và từ chối mô hình sai với thông báo rõ ràng.
3. Chuyển mô hình thành graph.
4. Sinh sơ đồ Mermaid và draw.io tự động.
5. Kiểm tra bộ benchmark có ground truth và patch hợp lệ.
6. Chạy toàn bộ cổng kiểm tra Phase 1.

> **Phạm vi hiện tại:** Phase 1 xây dựng Expected Architecture Model. Việc phân tích source code, so sánh Expected với Actual và chặn pull request thuộc các phase tiếp theo.

## 1. Chuẩn bị

Yêu cầu:

- Node.js 22 trở lên.
- pnpm 11 trở lên.
- draw.io Desktop nếu muốn mở file `.drawio`.
- Workspace nằm tại `D:\Little Boys\ArchSync`.

Mở PowerShell và cài dependency:

```powershell
cd "D:\Little Boys\ArchSync\archsync-core"
pnpm install --frozen-lockfile
```

Kiểm tra phiên bản công cụ nếu cần:

```powershell
node --version
pnpm --version
```

## 2. Câu mở đầu

Có thể giới thiệu như sau:

> ArchSync biến kiến trúc từ tài liệu tĩnh thành một hợp đồng mà máy có thể kiểm tra. Trong Phase 1, `architecture.yaml` là source of truth. Từ mô hình này, ArchSync thực hiện validation, tạo Expected Architecture Graph, sinh sơ đồ và cung cấp ground truth để đánh giá Guardian ở phase tiếp theo.

Luồng xử lý:

```text
architecture.yaml
        ↓
Schema + Semantic Validation
        ↓
Expected Architecture Graph
        ↓
Mermaid / draw.io / Ground Truth
        ↓
Guardian ở Phase 2
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

> Đây là biểu diễn graph chuẩn của kiến trúc mong muốn. Guardian sẽ dùng graph này làm Expected Model để so sánh với kiến trúc thực tế được phát hiện từ source code.

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

## 8. Demo benchmark

Chuyển sang repository benchmark:

```powershell
cd "D:\Little Boys\ArchSync\archsync-benchmark"
pnpm install --frozen-lockfile
pnpm verify
```

Kết quả mong đợi:

```text
VALID ...architecture.yaml (5 components, 5 relationships)
VALID GROUND TRUTH (5 no-impact, 3 violation, 2 evolution)
VALID PATCHES (10/10 apply cleanly)
```

Giải thích:

> Benchmark có 10 thay đổi code được phân loại trước: 5 no-impact, 3 violation và 2 evolution. Đây là đáp án chuẩn dùng để đo khả năng phát hiện của Guardian trong phase tiếp theo.

Có thể nêu ba ví dụ:

- `case01`: refactor pricing, không ảnh hưởng kiến trúc — `no-impact`.
- `case06`: frontend gọi trực tiếp payment service — `violation`.
- `case09`: bổ sung Redis — `evolution`, cần xem xét thay đổi kiến trúc.

## 9. Demo cổng kiểm tra toàn bộ Phase 1

Quay lại core và chạy:

```powershell
cd "D:\Little Boys\ArchSync\archsync-core"
pnpm phase1:verify
```

Lệnh này thực hiện:

1. Type checking.
2. Automated tests.
3. Kiểm tra toàn bộ fixture hợp lệ và fixture cố ý không hợp lệ.
4. Build package `@archsync/core`.

Kết quả mong đợi tại phiên bản hiện tại:

```text
Test Files  5 passed (5)
Tests       10 passed (10)
```

Giải thích:

> Đây là exit gate của Phase 1. Nếu bất kỳ schema, validator, graph, benchmark hoặc diagram generator nào bị lỗi, lệnh sẽ trả exit code khác 0.

## 10. Câu kết thúc

> Phase 1 đã tạo một nền móng có thể đo lường: kiến trúc được khai báo bằng máy, được kiểm tra, được chuyển thành graph, được trực quan hóa và có benchmark chuẩn. Phase 2 sẽ xây Guardian để phát hiện Actual Architecture từ source code và so sánh với Expected Architecture này.

Không nên tuyên bố ở thời điểm hiện tại rằng ArchSync đã:

- Phân tích toàn bộ source code tự động.
- Phát hiện violation trong pull request thực tế.
- Tự động chặn hoặc phê duyệt pull request.
- Đề xuất architecture evolution bằng AI.

Các khả năng đó thuộc các phase tiếp theo.

## 11. Kịch bản demo nhanh trong 2 phút

Nếu thời gian ngắn, chỉ chạy bốn nhóm lệnh sau:

```powershell
cd "D:\Little Boys\ArchSync\archsync-core"

# 1. Mô hình hợp lệ
pnpm arch:model validate test/fixtures/order-platform.architecture.yaml

# 2. Violation có chủ đích
pnpm arch:model validate test/fixtures/invalid-unknown-component.architecture.yaml

# 3. Sinh file draw.io
pnpm arch:model drawio test/fixtures/order-platform.architecture.yaml order-platform-demo.drawio
Invoke-Item .\order-platform-demo.drawio

# 4. Toàn bộ exit gate
pnpm phase1:verify
```

Sau đó trình bày kết quả benchmark đã kiểm tra trước:

```text
5 no-impact + 3 violation + 2 evolution = 10 benchmark cases
```

## 12. Xử lý nhanh khi demo gặp lỗi

### `pnpm` không được nhận diện

```powershell
corepack enable
corepack prepare pnpm@11.16.0 --activate
```

### Thiếu dependency

```powershell
pnpm install --frozen-lockfile
```

### draw.io báo `Start tag expected, '<' not found`

Bạn đã mở nhầm file `.mmd`. Hãy tạo và mở file `.drawio`:

```powershell
pnpm arch:model drawio test/fixtures/order-platform.architecture.yaml order-platform-demo.drawio
Invoke-Item .\order-platform-demo.drawio
```

### Hai fixture `invalid-*` trả exit code 1

Đây là hành vi mong đợi. Hai fixture này được tạo để chứng minh validator từ chối kiến trúc sai.
