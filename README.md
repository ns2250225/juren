# 方块进击：巨人守城（Titan Defense）

一款运行在浏览器里的 3D 守城动作游戏：扮演调查兵团士兵，使用立体机动装置在城市上空高速穿梭，斩杀巨人的后颈；同时经营城墙炮台与驻军防线，守护城市核心不被摧毁。

技术栈：**Vue 3 + TypeScript + Three.js + Pinia + Vite**，纯前端实现，没有任何后端服务。所有模型、贴图、音乐、音效均在运行时由代码程序化生成，无任何外部素材文件。

![Tech](https://img.shields.io/badge/Vue%203-3fae6a?logo=vuedotjs&logoColor=white) ![TS](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white) ![Three.js](https://img.shields.io/badge/Three.js-0.180-black?logo=threedotjs&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)

## 特性

- **立体机动战斗**：双钩索发射/回收、瓦斯加速、空中冲刺、锁定目标，速度越快斩击伤害越高
- **6 名可选角色**：艾伦、三笠、利威尔、阿尔敏、艾尔文、韩吉，各具专属技能（巨人化、旋风斩、全军突击等）
- **7 种巨人**：普通巨人、奇行种、铠之巨人、女巨人、兽之巨人、超大型巨人、进击的巨人（艾伦巨人化形态），均有独立 AI 行为、弱点与 Boss 阶段
- **4 张地图**：希干希纳区、托洛斯特区、玛利亚之墙、巨大树森林，含环形城区/线性防线两种布局
- **3 种模式**：速战守城（5 波）、标准守城（10 波，最终迎战超大型巨人）、无限生存
- **塔防式防御建设**：炮台、弩炮、补给站、维修站、警戒塔、巨人陷阱、驻军营地、内城防线，均可升级 3 级
- **NPC 兵团**：调查/驻屯/工程/医疗/指挥官五类士兵 AI，可下达集结/进攻/防守指令
- **完整的城市破坏系统**：民居 3 阶段渐进破坏、城墙破损、巨人破门
- **图鉴与升级**：巨人图鉴支持 3D 实时预览并可将模型导出为 GLB；装备与角色属性可持久化升级
- **移动端支持**：虚拟摇杆 + 触控按键，横屏自适应

## 快速开始

```bash
npm install
npm run dev      # 开发服务器 http://localhost:5173
npm run build    # 类型检查 + 打包到 dist/
npm run preview  # 本地预览打包结果
```

`dist/` 为纯静态产物，可用任意静态托管（GitHub Pages、Nginx、对象存储等）直接部署。

## 游戏目标

巨人将依次冲击城市的各层防线：

> 外城墙 → 城门 → 居民区 → 补给站 → 驻军据点 → 内城核心

- **失败条件**：内城核心生命值归零，或城市完整度低于 15%
- **胜利条件**：守住全部波次的巨人进攻
- **经济系统**：斩杀巨人与守波获得资金/材料，在波次间隙（按 `B`）建设或升级防御设施

## 操作

### PC 键位

| 按键 | 功能 |
| --- | --- |
| `W` `A` `S` `D` | 移动 |
| 鼠标 | 视角 |
| 空格 | 跳跃 / 空中推进 |
| 鼠标左键 | 斩击 |
| 鼠标右键 | 右钩索（再次按下释放，按住收卷） |
| `Q` | 左钩索 |
| `Shift` | 瓦斯加速 |
| `E` | 回收双钩索 |
| `G` | 一键双钩索 |
| `R` | 更换刀刃 |
| `F` | 互动 / 补给 / 手动操炮 |
| `1` `2` `3` | 角色技能 / 信号弹 / 空中冲刺 |
| `T` / 鼠标中键 | 锁定目标 |
| `Tab` | 战场地图 |
| `B` | 防御建设（波次间隙） |
| `N` | 立即开始下一波 |
| `Z` `X` `C` | 兵团指令：集结 / 进攻 / 防守 |
| `H` | 隐藏 HUD |
| 滚轮 | 镜头距离 |
| `Esc` | 暂停 |

### 移动端

进入游戏后自动启用虚拟摇杆与触控按键，建议横屏游玩。

## 目录结构

- `src/components/`：主菜单、出征准备、地图/角色选择、装备升级、巨人图鉴（3D 预览）、设置、说明、HUD、小地图、防御建设、暂停、结算、移动端触控等界面组件
- `src/game/core/`：GameEngine、GameLoop、InputManager、碰撞/射线、相机、粒子、特效、程序化音频
- `src/game/models/`：方块建模（角色、7 种巨人、5 类民居 × 3 个破坏阶段、城墙、城门、地标、树木、防御设施）
- `src/game/world/`：CityManager、WallSystem、DestructionSystem、导航网格、环境
- `src/game/characters/`：PlayerController、ODMGear（双钩索）、CombatSystem、Skills
- `src/game/titans/`：TitanManager、TitanAI（有限状态机 + Boss 阶段）、TitanWeakpoints
- `src/game/defense/`：WaveManager、DefenseManager、ResourceManager、Projectiles
- `src/game/npc/`：SoldierAI（调查/驻屯/工程/医疗/指挥官）、CivilianAI、NPCManager
- `src/data/`：角色、巨人、地图、波次、防御设施、升级的数据表

## 技术说明

- **物理**：未使用第三方物理引擎，而是自研轻量碰撞系统（绕 Y 轴旋转的包围盒 + 网格划分，支持射线与球体推出），包体更小，对网页更友好。
- **模型**：所有模型运行时由代码以方块拼装生成（`VoxelBuilder`），无外部 GLB 资源；图鉴中可将模型导出为 GLB。
- **音频**：音乐与音效全部由 Web Audio 程序化合成。

## 版权声明

本项目为同人性质的非商业技术练手作品。所有贴图、音乐、音效均为程序化原创生成，未使用任何官方素材。项目名称与设定仅作致敬用途，与原作者及版权方无关；公开发布或商业化前，请自行取得相应授权。
