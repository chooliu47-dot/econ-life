# Econ Life

极简 Local-First 双语工作与生活平台。日记、闪卡、阅读进度全部存在浏览器 IndexedDB（dexie）。**Gemini 在前端调用**，可走系统 / Clash 代理（适合国内网络）。

## 启动

```bash
cp .env.example .env.local
# 填入 NEXT_PUBLIC_GEMINI_API_KEY
# https://aistudio.google.com/apikey

npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_GEMINI_API_KEY` | 浏览器侧 Gemini（Journal 纠错 + 高级词汇提取） |

修改 `.env.local` 后必须重启 `npm run dev`。国内请先开启代理再使用 AI 功能。

## 模块

1. **Journal** — 文本 / 语音 → 浏览器直连 Gemini → 本地日记 + 情绪日历  
2. **Cards** — 本地词库，每日 20–30 词  
3. **Read** — 深度双语长文 · Play Audio（Web Speech）· Gemini 提取雅思/GRE/专业词  
4. **Data** — 导出 JSON/CSV、导入、清空  

## 说明

- 不再使用服务端 `/api/journal/analyze`（避免 Node 不走系统代理）。  
- 词汇提取失败时自动回退到文章内精选高级词库，不会无限 loading。  
- `NEXT_PUBLIC_` 密钥会进入前端包，仅适合个人本地使用。
