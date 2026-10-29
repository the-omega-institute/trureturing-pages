# Atlas 连通性核查（2026-10-30）

截图中的大块轮廓不能直接解释成两个理论模块。右侧三个可见标签都属于同一个最大弱连通分量；其余有依赖的小分量在布局中被排列到另一片区域。这里的弱连通指忽略箭头方向后可以沿已发布的依赖相互到达，不能推出任意两个模块之间存在有向依赖。

## 当前发布数据

核查主站 `data/atlas-startup.v1.json` 指向的完整图和依赖坐标，校验压缩包 SHA-256；使用页面相同的数学节点、边类型和状态筛选规则。数据绑定：

- 源仓库：`the-omega-institute/trureturing`
- 源提交：`3e7dac4c8cd1a8d96a48fd980f353ef96bf83239`
- Truth release：`sha256:b4cd607f016d82772da6566c086286493f33e19defa96e6eab84fd015554bd2c`
- Atlas graph：`sha256:c3010a84326c983dc836284a89f9f760204132d6716e8b7a52296389b262525b`

| 组成 | 连通分量数 | 模块数 | 依赖数 | 模块占比 |
| --- | ---: | ---: | ---: | ---: |
| 最大连通分量 | 1 | 7,981 | 12,774 | 71.0% |
| 其余有依赖的分量 | 368 | 1,942 | 2,025 | 17.3% |
| 图内无连接的单模块 | 1,314 | 1,314 | 0 | 11.7% |
| 合计 | 1,683 | 11,237 | 14,799 | 100% |

`site/assets/atlas-theory-core.mjs` 的 `theoryLayout` 给最大分量一个中心，并把其他有边分量放进独立的二维排布区域。每个节点的纵坐标由依赖深度决定。旋转后的投影会把许多独立的小分量压成一个长条状轮廓；空间距离和两个轮廓都不是额外的数学结构。1,314 个单模块还有单独的网格排布。

## 哪些内容确实尚未接入主分量

最大的几个小分量包括：

| 模块数 | 主要内容 | 自有基础模块的实例 |
| ---: | --- | --- |
| 149 | 循环词、删插传输、图路径与 Hamilton 圈拼接 | `CircularDeletionTransport`, `EdgeSlicing`, `PathRingSplicing` |
| 86 | 逆极限、shadowing、有符号测度及 weak-star 收敛 | `MittagLefflerInverseLimit`, `NormPreservingLifts` |
| 81 | light condensed / solid 群与派生范畴 | `HomologicalAlgebra/Solid/Definitions` |
| 70 | 双曲几何、hyperideal 结构及相关比较 | `FourCycleEnvelopes`, `HyperbolicUpperHalfSpace` |
| 48 | Miura 高度数组、边界极值、计数与刚性 | `MiuraHeightEnvelope`, `MiuraStripRigidity` |

在上述源提交逐一读取基础文件，确认 `CircularDeletionTransport` 直接导入 Mathlib 的 `Cycle`、`Finset.Card` 和 tactic；`NormPreservingLifts` 直接导入 Mathlib 的 signed measure、连续函数、Stone–Weierstrass 和 weak dual；`Solid/Definitions` 从 Mathlib、Lake 和 Lean 开始。这些文件没有通过主分量中的自有模块建立依赖。

Mathlib、Lean 和 Lake 位于当前仓库图的节点集合之外。因此“无图内连接”也包括使用外部基础库的模块。把 Mathlib 加成一个公共节点，会让很多分量形式上连通，却不能证明我们自己的理论被这些证明复用。现有结果呈现出任务内依赖密、跨任务复用较少的组织方式；仅凭这张图不能推断作者的研究动机。

## 主分量已经有真实汇合

截图中的三个标签都在最大分量中。按发布的有向 import 边计算传递可达的共同后继：

| 两个基础模块 | 共同后继模块数 |
| --- | ---: |
| Concept Fiber Decomposition / Classical DPI | 234 |
| Concept Fiber Decomposition / Rank-One Context Commutator | 192 |
| Classical DPI / Rank-One Context Commutator | 365 |

一个短的已发布汇合实例：

```text
ConceptFiberDecomposition
  → StateRecordReadoutDistinguishability
  → WithinRoundCouplingSameLayer

RankOneContextCommutator
  → CompleteContextTomography
  → ObserverDiagonalSeparation
  → ClosureNonimplicationTriple
  → WithinRoundCouplingSameLayer
```

这些是源码模块的导入路径。import 可能同时带入定义、实例和辅助引理；这项统计不等于声明级的逐定理使用证明。

另外，现有 46,268 条 structural-affinity 边没有跨越上述数学依赖分量。将 Blueprint 文档通过 truth anchors 对应到分量后，存在 3 条跨分量文档依赖和 1 条跨分量叙述引用。这些文档关系已有单独类型，不能作为新的 Lean 依赖混入 Full DAG。

## 建议的整合顺序

1. 先审查可读出的具体不变量与传输接口。循环词的 `restrict_walk` 已给出“每步删插保持未触及标签的读出”。可以比较它与主干的有限读出、状态记录和轨迹接口，寻找两端都会实际使用的通用保持性引理；需要检查类型、操作及假设是否一致。
2. 对测度分量先研究有限观测特化。将 locally constant tests、投影纤维和 signed measure 的总变差接口，与主干的观察与 TotalVariation 结果对照。当前一个接口处理紧空间与实测度，另一些接口处理有限质量函数；这中间需要真正的嵌入、推前和范数对应定理。
3. 保留尚无应用理由的独立分量，例如 solidification。连接的目标是得到可复用证明和新结论，不能仅靠空导入增加图上的边。

这些是待验证的研究方向，本次未编写新的数学桥接定理，也未修改上游仓库。页面当前可以进一步通过展示分量名称和高亮真实汇合路径，帮助读者看见已有的理论发展。

## 复核位置

- [循环词基础文件](https://github.com/the-omega-institute/trureturing/blob/3e7dac4c8cd1a8d96a48fd980f353ef96bf83239/D5/S3/Combinatorics/CircularWords/CircularDeletionTransport.lean)
- [测度基础文件](https://github.com/the-omega-institute/trureturing/blob/3e7dac4c8cd1a8d96a48fd980f353ef96bf83239/D5/S3/Topology/Measures/NormPreservingLifts.lean)
- [Solid 基础文件](https://github.com/the-omega-institute/trureturing/blob/3e7dac4c8cd1a8d96a48fd980f353ef96bf83239/D5/S3/HomologicalAlgebra/Solid/Definitions.lean)
- [汇合模块](https://github.com/the-omega-institute/trureturing/blob/3e7dac4c8cd1a8d96a48fd980f353ef96bf83239/D5/S3/ObserverMemory/Trajectories/WithinRoundCouplingSameLayer.lean)
