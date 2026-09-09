# 多窗口、多设备与屏幕工作台执行 Spec

状态：执行设计；尚未实施。日期：2026-09-10。代码基线：`a9cfe3f`。

## 1. 目标与已确认决策

本次直接实现多设备连接、同设备多个屏幕独立投屏、每个屏幕独立运行脚本。采用一个设备管理主窗口、每屏一个屏幕窗口、一个设置窗口的结构。

用户已确认：

- 屏幕窗口的工作台包含脚本库、流程编辑器、运行与调试面板。
- 多设备和每屏独立运行在本次实现，不只预留接口。
- 关闭屏幕窗口时，有运行任务先询问，无运行任务释放投屏资源。
- 屏幕窗口支持仅投屏和完整工作台两种模式，并记忆模式、适配窗口大小。

本文其余交互细节为明确的实施默认值，可在评审时调整。特别是：项目脚本全局共享；同一运行期屏幕只允许一个窗口；自建虚拟屏最后一个资源持有者释放后销毁；不自动恢复执行中的脚本。

本次不包含：跨设备脚本编排、批量群控、一个屏幕多窗口镜像、协同编辑算法、远程访问、多应用实例、重启后断点续跑、自动重建所有虚拟屏。

## 2. 现状及具体改造依据

| 当前实现 | 改造要求 |
| --- | --- |
| `src/main/index.ts` 单个 DeviceSessionService / ScreenSessionService / FlowRuntimeService | 保留主进程集中管理，改为设备与屏幕注册表 |
| `src/main/adb/device-session.ts` 已连接时拒绝第二个 transport；sessionId 在实例构造时生成 | 每次连接建立独立实例；重连产生新 sessionId |
| `src/main/adb/screen-session.ts` 单个 activeDisplayId、stream、videoPort | 每个 ScreenRef 独立流、控制通道、状态、队列和订阅 |
| `attachVideoPort()` 会关闭旧端口 | 端口替换只影响同屏、同窗口的旧订阅 |
| `src/main/runtime/flow-runtime.ts` 单个 run、callCache、pendingResume | 每屏一个执行槽；不同屏幕不共享运行中的可变状态 |
| `src/main/runtime/adb-flow-driver.ts` 已按 displayId 发送 input 命令 | 保留目标检查，改为绑定不可变 ScreenRef 的 driver |
| `src/main/runtime/adb-ocr-recognition.ts` 已支持 scrcpy 失败回退 screencap | 按屏解析截图；验证后台虚拟屏截图，不必先引入隐藏解码窗口 |
| `src/routes/(platform)/_modules/workbench-provider.tsx` 混合设备选择、编辑器、屏幕、选区、运行 | 拆为全局项目数据与屏幕范围内的工作台 |
| 设备、运行、日志向全部 BrowserWindow 广播；项目修改无广播 | 引入按窗口 scope 过滤的事件路由及项目变更事件 |
| 草稿保存有 expectedDraftVersion；编辑器只在 scriptId 改变时载入文档 | 保留乐观锁；单独跟踪编辑基线，不能通过更新 Query DTO 悄悄推进版本 |
| `(platform)` 路由未连接即重定向 pair | 主窗口与设置窗口不依赖设备连接；离线屏幕显示原位断线状态 |

以上为静态检查结论。多设备并发编码、同设备多显示屏输入隔离和后台截图尚无本次真机验证。

## 3. 窗口产品设计

### 3.1 主窗口：设备与屏幕管理

标题为“Scrcpy Platform”。全应用一个实例，不再承载流程编辑器或持续解码投屏。

内容：

- 设备列表：USB / 无线 transport、名称、连接状态、连接与断开；保留无线配对。
- 已连接设备可同时展开；每台设备列出物理屏、外部虚拟屏、自建虚拟屏。
- 屏幕卡片显示名称、类型、尺寸（可用时）、投屏状态、窗口状态、运行状态。
- 操作：打开/聚焦屏幕、创建虚拟屏、销毁自建虚拟屏、查看该屏运行摘要。
- 后台任务入口：打开目标屏幕窗口、停止对应任务；不通过主窗口转移任务目标。
- 设置入口、应用退出入口；断线或 ADB 不可用时显示可恢复错误，不使整个 UI 不可用。

点击已打开屏幕时恢复最小化并聚焦，不创建第二个窗口。创建虚拟屏成功后打开对应窗口；窗口打开失败时保留可见错误卡片和显式清理操作，不能留下无法管理的 owner。

### 3.2 屏幕窗口：固定屏幕范围

标题始终显示“设备名 · 屏幕名”，离线时附加离线标识。主进程绑定目标，窗口内没有改变设备/显示屏的下拉选项。前往另一屏幕只能打开或聚焦另一个窗口。

仅投屏模式：画面、必要标题区域、AVD 式侧边控制条。侧边条包含返回、主页、最近任务、音量、电源、静音、适应窗口、置顶、展开工作台。设备级功能需通过提示明确作用于整台设备。

完整工作台模式：左侧为投屏与侧边条；右侧为脚本区域，包含脚本库、流程编辑器、运行/调试面板。窄屏可将脚本库变为抽屉、运行面板变为底部页签，画面维持等比。沿用现有编辑器、节点配置、撤销重做、断点和日志功能。

模式切换不更换 BrowserWindow、不重连 ADB、不启动第二个 scrcpy、不切换运行目标。工作台状态保留在窗口级 store/provider；折叠仅隐藏或卸载昂贵视图，不能丢掉 dirty 文档、撤销栈、选中脚本、运行订阅。

坐标/区域选择在当前窗口完成；请求携带 editorDocumentId、nodeId、selectionId 和 ScreenRef。切换脚本、节点删除、断线或关闭窗口时取消；迟到结果不得写入新文档。

### 3.3 设置窗口

全应用一个非模态、独立顶层窗口。主窗口关闭不连带关闭设置窗口。

- 通用：主题、语言、屏幕窗口默认模式。
- 投屏默认配置：编码、帧率、码率等；区分全局默认与屏幕覆盖。
- 日志：全局日志、设备/屏幕/运行/窗口筛选、级别筛选、清空。
- 诊断与关于：版本、ADB 状态、当前会话/流/端口/任务数量。

从某个屏幕打开设置，可将日志筛选预设为该屏，但不会改变设置窗口的全局管理权限。

### 3.4 关闭与退出

| 情况 | 规定行为 |
| --- | --- |
| 屏幕没有任务、文档无未保存修改 | 关闭并释放窗口持有的投屏资源 |
| 文档未保存 | 先选择保存并继续、放弃并继续、取消；保存失败必须取消关闭 |
| 屏幕有 running / paused 任务 | 再选择后台继续、停止并关闭、取消 |
| 后台继续 | 关闭 renderer，保留任务所需 screen/virtual-owner；主窗口显示后台运行 |
| 停止并关闭 | 等待取消完成或进入明确失败状态后释放资源；不能直接孤立执行进程 |
| 关闭主窗口但仍有屏幕或设置窗口 | 仅关闭主窗口 |
| 关闭最后一个窗口且仍有后台任务 | 保留/重新显示主窗口供管理；不留下无入口的后台应用 |
| 最后一个窗口关闭且无后台任务 | Windows 退出；macOS 保留原生激活重开行为 |
| 显式退出应用，有运行任务 | 展示任务数量，确认停止全部并退出或取消；没有“后台继续退出” |

“投屏资源”包含流、端口、解码器和控制连接。自建虚拟屏的 scrcpy owner 同时维持屏幕生命周期：没有窗口和任务持有时销毁屏幕；物理屏和外部虚拟屏只停止本应用的投屏，不销毁系统屏幕。创建对话框与虚拟屏关闭菜单需清楚说明这一行为。

后台任务结束后，如果没有窗口重新接管，则释放最后一个 run lease，清理流和自建虚拟屏。再次打开同一虚拟屏配置属于新建屏幕，不承诺恢复原 Android 应用状态。

断开设备/销毁屏幕与关闭窗口是不同命令。目标存在任务时先确认停止；设备断开只取消该设备任务。非预期断线将对应任务结束为 failed，并记录 device-disconnected；不自动重跑。

## 4. 身份、scope 与资源归属

### 4.1 标识定义

```ts
type DeviceRef = {
  deviceId: string;  // 应用设备记录 ID；不再等同于 transportId
  sessionId: string; // 一次连接的 UUID，重连必变
};
type ScreenRef = DeviceRef & {
  displayId: number; // Android ID，仅在设备/会话内有意义
  screenInstanceId: string; // 防止同一会话内 displayId 删除后被复用
};
type WindowContext =
  | { windowId: string; kind: "manager" }
  | { windowId: string; kind: "settings" }
  | { windowId: string; kind: "screen"; target: ScreenRef };
```

WindowContext 由主进程注册，renderer bootstrap 只读取。URL hash 只决定界面，不构成授权或目标来源。窗口生命周期内 target 不变；重连后新建绑定，旧窗口保留离线文档并提示在新会话打开。

`transportId` 保留十进制字符串，属于当前 ADB transport；所有 ADB 操作均使用连接对象绑定的 transport，不能按设备列表顺序/当前选择寻找目标。

### 4.2 设备与屏幕偏好标识

- deviceId 是本地注册记录。可信稳定硬件身份能够匹配时复用；序列号不可靠/相同/缺失时不自动合并。
- 无线地址是连接端点，不是永久硬件身份。USB 与无线映射证据不足时作为独立记录展示，并允许显式关联；不可只凭机型合并。
- 已知同一硬件的多个 transport 只允许一个活动设备会话；后续可切换连接，切换产生新 sessionId。不承诺识别所有未知重复硬件。
- 物理屏偏好键优先使用设备记录 + Android display uniqueId；无法取得时仅会话内记忆，避免错误复用。
- 自建虚拟屏使用持久化 profileId 记忆尺寸/DPI/窗口模式；每个配置同一设备只允许一个活动实例。需要相同参数的第二屏可复制配置产生新 profileId。
- 外部虚拟屏无稳定身份时只保存会话内偏好。

### 4.3 服务结构

```text
ApplicationServices
  WindowManager + WindowContextRegistry
  EventRouter
  DeviceRegistry -> Map<sessionId, DeviceContext>
    DeviceContext: connection, app cache, display catalog, device operation queue
      ScreenRegistry -> Map<screenInstanceId, ScreenContext>
        ScreenContext: ScreenRef, stream, controller, leases, state, queue
        FlowRuntimeService: one active run slot, bounded completed history
  ProjectStore + PreferencesStore (one SQLite connection owner)
  RunRegistry (runId -> immutable ScreenRef + runtime)
  OcrScheduler (bounded workers)
  Logger (structured scope)
```

设备连接与自建屏 owner 在主进程；renderer 仅持有展示、编辑临时态和解码器。所有异步清理幂等。移除一个 ScreenContext 不遍历关闭其他屏幕；一个 device 的错误不进入全局 shutdown。

操作锁分层：设备 connect/disconnect 和目录/创建/销毁协调用设备级锁；屏幕启动/停止/流重启用屏幕级锁；设备级电源等用短操作队列。禁止长时间脚本执行持有设备全局锁。定义固定锁顺序 device -> screen，清理时禁止反向等待造成死锁。

### 4.4 状态所有权

| 数据 | 归属 |
| --- | --- |
| 项目、脚本、修订 | 全局持久化；各窗口共享内容 |
| 当前项目/脚本、编辑基线、dirty、undo、视口、选区 | 屏幕工作台/文档本地；不同窗口相互独立 |
| 设备应用列表、设备连接、设备级设置 | DeviceContext |
| 流/截图/输入/运行、屏幕错误、显示尺寸 | ScreenContext |
| 模式、两种模式的窗口几何、面板布局 | 持久化 screen preference key |
| 窗口焦点、最小化、port attachment | 当前 WindowContext |
| 音量、电源、部分 scrcpy 设置 | 设备级共享能力，不能伪装成完全屏幕隔离 |

## 5. IPC、订阅与前端缓存

### 5.1 能力边界

| 调用 | 主窗口 | 屏幕窗口 | 设置窗口 |
| --- | --- | --- | --- |
| 设备发现/连接/断开、创建/销毁屏幕 | 允许 | 不允许直接调用，打开管理入口 | 只读诊断 |
| 当前屏幕输入/视频/截图/启动任务 | 不直接执行 | 仅绑定目标 | 不允许 |
| 停止后台任务 | 可按 runId 管理 | 仅绑定屏幕的 runId | 不允许 |
| 项目读写、修订 | 按需读取摘要 | 全局项目 API | 不需要 |
| 应用设置、全局日志 | 按需摘要 | 自身范围、打开设置 | 允许 |
| 改窗口模式/大小/置顶 | 自己的窗口 | 自己的窗口 | 自己的窗口 |

每个 handler 用 event.sender.id 查 WindowContext；不相信 renderer 提交的 windowId/deviceId。屏幕 API 可以使用预加载层的 `screen.*` 形式省略目标，主进程注入目标；公共 DTO/内部 service 仍使用完整 ScreenRef。runId、streamId、capture requestId 均验证属于当前目标。所有入参使用 strict schema 和有限大小验证。

建议新增 `window-contracts.ts`、`scope-contracts.ts`、`event-contracts.ts` 和 `preferences-contracts.ts`，保持 preload 类型化封装。修改现有 device/screen/run contracts 时前后端一次切换，禁止保留隐式“当前设备”兜底。

### 5.2 API 清单

- windows：bootstrap、openManager、openSettings、openScreen、setMode、fitContent、setAlwaysOnTop、requestClose。
- devices：listTransports、listSessions、connect、disconnect、pairWireless、connectWireless。
- displays：list(DeviceRef)、createVirtual(DeviceRef, profile)、destroy(ScreenRef)。
- screen（绑定目标）：snapshot、subscribeVideo、unsubscribeVideo、injectTouch、injectKeyboard、pressButton、setOverride。
- runs：start(本地脚本快照 + debug 参数)、current、history、stop(runId)、resume(runId, action)。
- preferences：read/update，更新携带 expectedVersion；字段 patch 不覆盖其他窗口字段。
- events：subscribe 并返回首份 snapshot+sequence、unsubscribe；按 event topic 过滤。

错误至少覆盖：scope-mismatch、session-stale、screen-stale、device-not-connected、display-not-found、run-busy、stale-draft、resource-limit、unsupported、operation-failed。用户消息描述具体设备/屏幕及可采取操作，日志保留底层错误。

### 5.3 事件与缓存规则

事件 envelope 含 eventId、topic、scope、sequence、payload。sequence 在相应 topic/scope 内单调递增。订阅登记与初始 snapshot 序号在主进程同一同步步骤完成；异步事件可缓冲到 bootstrap 完成。检测序号缺口时重新获取快照；窗口重载不依赖收到过去所有事件。

- 主窗口接收设备/屏幕/任务摘要，不接收视频帧和所有节点日志。
- 屏幕窗口接收本屏状态、任务与日志，以及共享项目变更。
- 设置窗口仅在日志页订阅全量日志，离开即退订。
- Query key 使用完整 scope：`['screen', sessionId, screenInstanceId]`、`['apps', sessionId]`、`['run', sessionId, screenInstanceId]`。项目 key 保留全局 projectId/scriptId。
- 热状态以事件为主，取消每窗口重复轮询；设备发现由一个主进程 watcher 或共享轮询负责。
- 项目事务提交后广播 entity-changed/deleted；删除同时通知相关编辑窗口。

特别处理编辑冲突：编辑器记录 `baseDraftVersion`，只在显式载入/成功保存时更新。外部变更且编辑器 clean 时载入新文档；dirty 时保持本地文档和旧版本，显示“外部已更新”，提供重新载入、另存副本。不可用刷新后的 DTO 版本保存旧画布。脚本被删除时保留可另存的 dirty 文档，不能清空画布。

关闭/刷新/renderer 崩溃统一撤销事件订阅、video attachment 和悬挂选区请求。正常关闭执行 dirty 握手；崩溃无法保证临时编辑内容恢复，必须如实提示该限制。

## 6. 多屏流、输入、音频与 OCR

### 6.1 屏幕生命周期

每屏状态：idle -> starting -> streaming -> stopping -> idle；出现错误进入 error；目标消失进入 unavailable。删除自建屏进入 destroyed，为终态。窗口状态与流状态分开。

持有者使用显式 lease：window、run、creation（仅创建与窗口接管之间的临时持有）。同屏 lease acquire/release 幂等、有 owner ID。最后一个 lease 释放后停止流；如果是自建屏，停止 owner 并移除实际屏幕。创建失败/打开失败不无限保留 creation lease：转为明确管理状态或执行补偿清理。

每个目标最多一个 scrcpy 视频 producer；拥有虚拟屏的 producer 直接复用为本屏投屏。不得为了打开窗口再启动一个 newDisplay server。主进程无 renderer 时仍排空保留流，避免反压卡住 Android；不缓存无限视频数据。

端口 binding 包含 ScreenRef、streamId、attachmentId、senderId。重载仅替换该屏旧 attachment；stale stream 请求拒绝。配置包与关键帧恢复按屏处理；积压有界，丢帧后等待关键帧或请求该流 resetVideo，不能随机丢弃依赖帧继续解码。取消订阅不会关闭其他屏幕。

### 6.2 输入隔离与坐标

鼠标、键盘只投递当前窗口绑定的 controller。失焦/关闭/断线发送可行的 key-up、touch-cancel 并清空本地按键集合，防止粘键。

UI 指针位置先扣除 letterbox 和工具栏，再映射到视频内容归一化坐标。脚本使用 Android 显示坐标，必须明确视频缩放、旋转和显示实际尺寸的转换。截图元数据包含 sourceWidth/sourceHeight、displayWidth/displayHeight、rotation；OCR 区域在两种截图源之间使用同一转换，禁止直接把 maxSize 后的像素当设备像素。

运行期间默认禁用该屏手动输入，保留暂停/停止；暂停时允许手动操作。其他屏幕不因此禁用。按钮分为 display-targeted 和 device-wide；电源、音量及不能可靠按屏发送的功能标注“设备”，不承诺 Android 不支持的隔离。

### 6.3 音频与设备级 scrcpy 设置

同一设备多个屏幕不可默认重复播放设备输出。每设备设置一个音频持有屏幕，初始为第一个申请音频的屏幕；其他窗口静音，可显式“在此播放设备声音”。切换不应销毁虚拟屏 owner；实施时验证现有 scrcpy 客户端是否支持所需切换路径。

全局默认配置只用于新流；屏幕 override 显式持久化。turnScreenOff、stayAwake、showTouches、powerOffOnClose 归入设备级策略，多个流不能各自恢复相互覆盖。尤其单个窗口关闭不得触发 powerOffOnClose 影响其他屏幕；这类收尾副作用集中在设备最后资源释放时执行。需要重建虚拟 owner 的配置改变先说明将重建屏幕；任务运行中拒绝，不能静默重建。

### 6.4 OCR 与后台运行

沿用“scrcpy 快照优先，失败回退 ADB screencap”，同时支持明确选择 screencap。

- 只向本屏绑定 renderer 请求截图，校验响应 sender、scope、streamId、requestId、尺寸与字节上限。
- 无可用 renderer 直接使用 screencap；有 renderer 但超时/无帧时及时回退。建议快照等待上限 1 秒，可通过已有常量体系配置。
- 后台 run lease 维持自建虚拟屏 owner。后台 OCR 必须在真实虚拟屏上验证 SurfaceFlinger ID 映射与抓图。
- ADB fallback 也失败时明确使节点失败；不得用其他屏幕、旧缓存图像替代。
- OCR worker 使用有界池（初始最多 2 个），同一个 worker 从 setParameters 到 recognize 完成独占，防止并行语言/白名单相互污染。排队请求可取消；终止一个任务不能销毁另一个任务在用的 worker。
- 语言数据由共享初始化服务去重准备，不能多个任务并发覆盖安装文件。

隐藏页面解码不作为首版前提。如果特定设备无法后台抓取虚拟屏，P0 必须记录并选择修复截图实现或补充独立 capture worker；不能宣称该设备后台 OCR 已支持。

## 7. 每屏运行模型

每屏一个 active run（running/paused），不同设备和同设备不同屏允许并发。RunRegistry 按 runId 路由停止/恢复，不按当前窗口焦点寻找 runtime。

启动时：校验 ScreenRef 存活 -> 原子占用本屏执行槽 -> 获取 run lease -> 编译并固定文档与调用依赖快照 -> 执行。任一步失败必须回滚槽位/lease。执行开始后保存同名脚本不会改变本次程序。

运行数据保存原始 ScreenRef、scriptId、draftVersion 或临时文档标识、调试参数。不同运行独立拥有 breakpoints、pendingResume、callCache、日志序列和 AbortController。同屏只拒绝重复任务，不应返回全局 run-busy。

结束顺序：提交终态和摘要 -> 解除输入占用 -> 释放 run lease -> 清理本屏资源（若没有其他 lease）。短期历史与日志按屏有界保留，建议每屏 20 次、每次 2,000 条；全局再设总内存预算和淘汰规则，不提供本次重启后运行历史保证。

显式断开设备先阻止新任务，取消该设备所有任务，再关闭该设备屏幕和连接。所有子资源清理使用 allSettled/等价方式汇总错误，不能第一个异常跳过其他设备清理。

## 8. AVD 式窗口布局与自动缩放

### 8.1 模式记忆

每个稳定 screen preference key 保存 mode（mirror/workbench）、两套 normal content bounds、各模式宿主 monitor 信息、workbench panelLayout、selectedProjectId/selectedScriptId、alwaysOnTop。当前 sessionId/streamId 不持久化用于复连。

首次打开使用全局默认（mirror）；首次 workbench 默认参考 1200×800 DIP，并受可用工作区限制。恢复时默认 normal 状态，不自动进入全屏；置顶对新屏默认关闭。

切换模式先保存旧模式 normal bounds，然后恢复新模式 bounds；新模式没有记录时计算。隐藏工作台不保存脚本、不停止任务。快速切换带 request generation，只有最后一次布局请求生效。

### 8.2 尺寸算法

使用宿主显示器 workArea 的 DIP 单位；Android 视频像素用于比例，不直接作为 OS 物理像素。记 video W/H、工具条和标题额外尺寸 Cw/Ch、可用区 Aw/Ah、安全边距 M=24 DIP。

```text
availableW = max(1, Aw - 2*M - Cw)
availableH = max(1, Ah - 2*M - Ch)
fitScale = min(availableW / W, availableH / H)
scale = min(preferredScale ?? fitScale, fitScale)
contentSize = round(W*scale + Cw, H*scale + Ch)
```

尺寸未知时先显示占位，首次有效 metadata 后仅计算一次。工具栏布局测量在 UI 稳定后上报，主进程验证有限值与范围后使用。工作台模式按面板布局和视频 contain 渲染，自由调整大小；仅投屏模式保持视频比例与工具栏空间。

只有首次打开、显式模式切换、视频方向/分辨率变化、用户选择“适应画面”、宿主显示器移除时触发自动 sizing。普通帧更新不触发。分辨率变化采用 150ms 防抖；用户正在拖动时延迟执行，保存新 preferredScale。

已有目标模式 bounds 时优先尊重用户布局，只做工作区裁剪；方向变化时 mirror 模式按已有缩放重新计算，workbench 只更新内部画面比例。最大化/全屏时不修改外部 bounds，退出后使用更新后的 normal 几何。

恢复位置用与原窗口相交最多的显示器，已移除则使用主显示器；最终限制内容与标题可见。高 DPI、多显示器负坐标、缩放比例变化必须覆盖。

Electron 的 setAspectRatio 程序化 resize 不自动遵守比例，extraSize 还有平台差异。因此 sizing 计算由自己的纯函数负责；macOS 可使用 extraSize 辅助，Windows 需要验证 resize 修正或采用自由窗口 + 等比 letterbox。首次执行不得以平台 API 存在代替跨平台验证。[BrowserWindow 文档](https://www.electronjs.org/docs/latest/api/browser-window/)

宿主 monitor 变化通过 screen 事件检测，使用 workArea/DIP 而不是 CSS screen.width 或把 scaleFactor 重复相乘。[screen 文档](https://www.electronjs.org/docs/latest/api/screen/)

## 9. 持久化与迁移

新增 SQLite migration，现有 projects/scripts/script_revisions 数据结构和内容保持兼容：

- device_profiles：id、identity JSON、名称、创建/更新时间。
- virtual_display_profiles：id、deviceProfileId、名称、width/height/dpi、packageName。
- ui_preferences：key 主键、schemaVersion、version、value JSON、updatedAt。

ui_preferences 保存 app/global、window/manager、window/settings、screen/<stable-key>。进行 schema 校验；损坏单项回退默认并记录日志，不阻止应用启动。窗口 bounds 保存防抖 300ms，关闭前 flush；同键更新 version 冲突时合并指定字段或重试，禁止全对象覆盖其他设置。

旧 localStorage 的主题、语言、scrcpy、虚拟屏参数、布局逐项列清单。由首次主窗口 bootstrap 通过一次性 importLegacyPreferences 调用迁移，主进程事务标记完成；只填缺失项，多窗口同时启动不得重复覆盖。旧布局作为新 workbench 初始模板；原始 localStorage 保留以便回退。设备会话、窗口实例、运行中的任务不写成可自动恢复状态。

实施前备份数据库到同 userData 的带时间戳文件并验证可读；新增迁移失败事务回滚。保留旧版本构建和备份供人工回退；不自动降级已迁移数据库，不自动删除新偏好。

## 10. 实施拆分与依赖

### P0：风险验证与契约冻结

交付：针对当前依赖和可用真机的最小验证记录，最终 scope schema、关闭规则和窗口布局纯函数接口。

必须验证：一台设备的物理屏+自建虚拟屏同时流；两台设备同时流；同设备不同 display 输入；后台 virtual screencap；关闭一个 scrcpy owner 对其他流、音频和电源设置的影响。不可用硬件明确列为未验证，不能以 mock 替代完成声明。

若并发编码存在设备限制，定义 typed resource-limit 与部分成功 UI；不全局降低其他流配置。若音频迁移需要重建 owner，默认每设备固定音频 owner，并将“切换此处播放”禁用说明原因，直到完成不会销毁屏幕的实现。

### P1：标识与多设备基础

新增 `src/main/devices/device-registry.ts`、`device-context.ts`，复用 Tango gateway 与单连接逻辑。更新 device contracts、ADB driver、OCR provider 和应用缓存 key。连接发现统一管理；先完成多设备隔离和重连失效测试。

完成标准：连接 A/B、断开 A 时 B 不受影响；旧 session 的请求被拒绝；同 transport 并发连接幂等。

### P2：每屏资源与并发 runtime

新增 `src/main/screens/screen-registry.ts`、`screen-context.ts`、`screen-leases.ts`；逐步拆分现有 screen-session 的目录、虚拟 owner 和流逻辑。新增 `src/main/runtime/run-registry.ts` 与 OCR scheduler。保留现有运行编译/节点语义。

完成标准：A/0、A/虚拟屏、B/0 三个目标独立运行、控制和截图；停止一个只影响对应目标；虚拟 owner 无重复创建；任务和窗口交错释放无泄漏。

### P3：窗口与 IPC 基础

新增 `src/main/windows/window-manager.ts`、`window-context-registry.ts`、`window-layout.ts`、`close-coordinator.ts`，以及 `src/main/ipc/event-router.ts`。主进程入口只组装服务和应用生命周期，IPC handlers 只注册一次。所有窗口保留现有隔离、安全 preload 和导航限制。

完成标准：窗口去重、scope 验证、订阅/端口销毁、最后窗口/退出协议；开发 URL 与打包 loadFile 的 hash 路由都可用。

### P4：新路由与三种窗口 UI

建议路由：`/manager`、`/screen`、`/settings`；入口读取 bootstrap 后映射对应 shell。移除全局必须连接的 platform guard。复用现有 device UI、DeviceMonitor、ScriptBrowser、FlowEditorPanel、RunPanel、SettingsScreen。

将 WorkbenchProvider 改为 ScreenWorkbenchProvider(scope)，分离 GlobalProjectProvider；所有 screen/run hooks 绑定 scope。编辑基线同步与 dirty 关闭处理在本阶段完成。

完成标准：每屏能选不同脚本；工作台折叠保留文档；不同窗口保存同脚本不会静默覆盖；断线留在当前屏幕界面。

### P5：模式缩放、偏好与设置日志

实现布局纯函数、两模式几何恢复、窗口 resize 防抖和显示器变更处理；实施 migration 与 legacy import；日志新增结构化 deviceId/sessionId/screenInstanceId/displayId/runId/windowId，旧日志字段缺失仍可读取。

完成标准：重开记忆正确、虚拟 profile 不错绑 displayId、日志筛选不串设备、全局设置广播及时且不静默重启活动流。

### P6：集成验收与交付

运行静态检查、现有回归测试和下述矩阵；记录设备型号/Android 版本、host 平台、编码设置、并发数与性能。修复后只重跑受影响矩阵与必要回归。提供用户行为变更说明、未验证项和回退路径。

阶段依赖：P0 -> P1 -> P2；P3 依赖 P1 的 scope 契约；P4 依赖 P2/P3；P5/P6 在真实 UI 可运行后完成。不得仅完成开窗 UI 就宣称本 spec 已实现。

## 11. 验收矩阵

| ID | 场景 | 必须结果 |
| --- | --- | --- |
| A01 | 同一屏连续/并发点击打开 | 一个窗口、一个 producer；聚焦已有窗口 |
| A02 | 两台设备都有 displayId=0 | 视频、输入、运行、截图和日志互不混用 |
| A03 | 同设备物理屏+两个虚拟屏 | 三窗口同时显示；任一任务不触发其他屏 run-busy |
| A04 | 同屏重复运行 | 第二次返回本屏 run-busy，原任务继续 |
| A05 | A 断线，B 运行中 | A 任务失败并清理，B 持续运行 |
| A06 | A 重连，旧请求/port/capture 回来 | 明确拒绝，不能控制新连接 |
| A07 | 删除显示屏后 ID 被复用 | 旧 screenInstanceId 请求拒绝 |
| A08 | 无任务关闭物理屏 | 释放本屏流/解码器，设备连接保留 |
| A09 | 无任务关闭自建虚拟屏 | owner 和该虚拟屏消失，其他屏存在 |
| A10 | 有任务选择后台继续 | renderer 销毁，任务包括 OCR 继续；结束自动释放无主资源 |
| A11 | 有任务选择停止并关闭/取消 | 前者取消清理；后者窗口与任务不变 |
| A12 | dirty 关闭，保存冲突 | 保留窗口与本地文档，不强行关闭 |
| A13 | 两窗口编辑同脚本 | clean 同步；dirty 保留旧基线，stale-draft 生效 |
| A14 | 折叠再展开工作台 | 文档、撤销栈、选区状态规则、运行保持正确，无第二个流 |
| A15 | 快速切换模式/旋转/resize | 最终模式尺寸正确，无持续 resize 循环 |
| A16 | 跨 DPI 移动、拔掉外接显示器 | 窗口可见、不重复乘缩放因子 |
| A17 | 最大化/全屏时切模式 | 不强制退出；恢复后 normal bounds 合理 |
| A18 | 多屏音频、电源/音量 | 不重复播放；设备级效果明确；关一屏不误关整机 |
| A19 | 两个 OCR 不同语言/白名单同时执行 | worker 参数不串扰；取消一个不影响另一个 |
| A20 | renderer reload/crash、创建流失败 | 不影响其他屏，订阅/端口清理，可重新打开 |
| A21 | renderer 伪造另一屏 runId/streamId | 主进程 scope-mismatch，不发送数据或输入 |
| A22 | 关闭最后窗口、显式退出、多设备清理异常 | 符合关闭规则；一个清理异常不跳过其余清理 |
| A23 | 迁移重复启动、损坏单项偏好 | 原项目完整；迁移幂等；损坏项局部回退 |
| A24 | 开关屏幕窗口 20 次 | registry/lease/port/listener 回到初始值，内存无持续累积趋势 |

自动测试重点：scope 路由、连接/屏幕世代失效、lease 状态机、run 并发取消、编辑基线冲突、窗口布局纯函数、迁移幂等和 OCR worker 独占。复用现有 Vitest 与假 gateway，不为纯样式或静态布局写镜像断言。

仓库检查：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`。Windows 与 macOS 都做开发及打包后的窗口冒烟；未获取某平台时单独标记，不将另一平台结果外推。

性能验收：在固定设备/分辨率/码率下记录单屏基线、三屏 10 分钟 CPU/GPU/内存、FPS 和输入延迟。要求无跨屏卡死、无限缓存与关闭后资源持续增长；设备编码能力不足以明确错误降级。具体 FPS/内存数值在 P0 测量后写入记录，不能预先保证所有硬件统一指标。

## 12. 最终交付要求

- 本文所有本次范围的阶段完成，并附 A01–A24 的通过/失败/未验证证据。
- 数据迁移与回退说明、已知 Android 设备能力限制明确。
- 不存在 renderer 端全局“当前设备/当前屏幕/当前运行”来路由业务操作。
- 每个屏幕的窗口、任务、视频端口、虚拟 owner 能独立定位和清理。
- 项目与脚本仍共享，编辑冲突明确可见，模式切换不损失编辑内容。
- 任务后台 OCR、多设备并发、同设备多虚拟屏及两平台窗口行为以实际测试报告为准。

外部 API 参考仅用于窗口实现约束；Electron latest 文档可能领先本项目版本，实施需同时检查安装的 `node_modules/electron/electron.d.ts`。本次已确认本地存在 setAspectRatio/setContentBounds 声明，未进行原生窗口运行验证。
