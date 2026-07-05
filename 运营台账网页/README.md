# 小红书运营台账

这是一个带本地后端的运营台账网页。客户、笔记排期等数据会保存到：

```text
运营台账网页/data/ledger.json
```

## 启动方式

方式一：双击这个文件：

```text
启动台账.command
```

方式二：在当前文件夹运行：

```bash
node server.js
```

然后打开：

```text
http://127.0.0.1:8787
```

页面左侧如果显示“后端已连接：文件数据库”，说明数据会写入 `data/ledger.json`。

## 月度规划和备选方案

每篇笔记现在有三个规划字段：

```text
planMonth  规划月份，例如 2026-07
planKind   monthly 表示月度规划，backup 表示备选方案
tags       选题标签，例如 探店招募、场景营销
image      参考图片，可保存封面/排版/示例图
```

客户页可以按月份查看历史规划。比如 8 月导入后，7 月规划仍然保留，可以切回 `2026年7月` 查看。

备选方案不会进入今日发布、设计提需、客户审核等强提醒，除非你把它改成“月度规划”。

客户资料现在支持：

```text
contractMonths  签约时长，可选 3/6/12 个月
attention       客户注意点，例如审核习惯、禁忌词、老板偏好
```

月度日历支持：

```text
calendars       每个客户每个月可保存一张日历图片和一份月度规划一览
```

今日页有“日计划 / 周计划”四象限，会按紧急重要程度自动归类任务。

今日任务支持：

```text
未处理
已读
已完成
```

上方筛选可以查看未读/未完成、已读、已完成或全部任务。

今日页可以手动添加日计划/周计划，并选择四象限：

```text
紧急重要
紧急不重要
不紧急重要
不紧急不重要
```

左侧有独立的“设计提需”页面，会按笔记发布日期倒推 2 天提醒，并可选择：

```text
自己制作图片
设计制作图片
```

左侧有独立的“月度规划”页面，用更宽的卡片视图查看客户每月 10 篇规划和备选方案。

笔记排期支持：

```text
已发布 / 未发布筛选
未发布子状态：待选题、待设计提需、待文案、待制作、待客户审核、待发布
每篇笔记可填写笔记文案
月度发布进度总览
```

周报页支持保存并载入每个客户上次使用的周报模板，默认落款为 `@老板`。

## 注意

如果你直接双击 `index.html` 打开，页面仍然能用，但会显示“本地缓存模式”，数据只会临时存在浏览器里。

## 可用接口

```text
GET  /api/health
GET  /api/ledger
PUT  /api/ledger
```

## 云端版部署方式

云端版的目标是：任何电脑打开同一个网址，看到同一份客户、笔记、日计划、周计划和品牌参考数据。

### 需要准备

```text
1. GitHub：用来放这份网页代码
2. Render 或 Railway：用来运行 server.js，生成外网网址
3. Supabase：用来保存云数据库
```

### 第一步：创建 Supabase 数据库

1. 打开 Supabase，新建一个 Project。
2. 进入左侧 SQL Editor。
3. 复制本文件夹里的 `supabase-schema.sql` 全部内容，粘贴运行。
4. 进入 Project Settings -> API，复制这两个值：

```text
Project URL
service_role key
```

注意：`service_role key` 不能发给别人，也不要放到前端网页里，只能填在部署平台的环境变量里。

### 第二步：部署到 Render

1. 把 `运营台账网页` 这个文件夹上传到 GitHub 仓库。
2. 打开 Render，新建 Web Service，选择这个 GitHub 仓库。
3. Root Directory 如果可以填写，就填：

```text
运营台账网页
```

4. 启动命令填写：

```text
node server.js
```

5. Environment Variables 添加：

```text
SUPABASE_URL=你的 Supabase Project URL
SUPABASE_SERVICE_ROLE_KEY=你的 Supabase service_role key
SUPABASE_TABLE=ledgers
LEDGER_ID=main
```

6. 点击 Deploy。成功后 Render 会给你一个网址，例如：

```text
https://pink-rabbit-xhs-ledger.onrender.com
```

以后你的上班电脑、家里电脑，都打开这个网址即可同步。

### 当前 4 个客户会不会丢？

不会。现在本地文件 `data/ledger.json` 里已有 4 个客户和 40 篇笔记。

云端版第一次启动时，如果 Supabase 里还没有数据，会自动把 `data/ledger.json` 作为种子数据写入云数据库。也就是说，第一次部署成功后，阿明小菜、璞元壹境、玄家、雅居小馆会自动进入云端。

如果页面左下角显示：

```text
后端已连接：云端数据库｜已加载 4 位客户
```

说明你打开的是云端同步版。

如果显示：

```text
后端已连接：本地文件数据库
```

说明你还在本机运行，不是云端网址。

如果显示：

```text
兜底/本地模式
```

说明后端没有连上，新增内容只会临时保存在当前浏览器里。
