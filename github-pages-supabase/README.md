# GitHub Pages + Supabase 发布版

这一套文件是现有局域网版本的**独立发布层**：不修改 `study-site/`、`study_server.py` 或 `study-data/`。发布时，工作流复制 `study-site/` 到临时目录，再覆盖为本目录的 `sync.js`，使进度保存到 Supabase。

## 1. 建立独立 GitHub 仓库

建议把整个 `user-study-deploy` 文件夹作为一个新仓库推送。不要上传 `study-data/` 或任何已有参与者结果；新增的 `.gitignore` 会排除该目录。若它以前已经被 Git 跟踪，先从 Git 暂存区移除它，但保留本地文件。

仓库的默认分支需要叫 `master`。若使用 `main`，把 `.github/workflows/deploy-pages.yml` 中的 `master` 改成 `main`。

## 2. 建立 Supabase 项目和表

1. 在 Supabase 新建项目。
2. 打开 **SQL Editor**，执行 `supabase/migrations/20261103000000_create_study_sessions.sql` 的全部内容。
3. 在本机安装 Supabase CLI 并登录，然后在本目录运行：

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase functions deploy study-api
   ```

   也可在 Supabase Dashboard 的 Edge Functions 页面按同样内容创建并部署 `study-api`。公开问卷不要求参与者登录；浏览器通过 `apikey` 请求头发送公开 anon / publishable key，函数自行校验提交内容。

4. 在 Supabase 项目 **Settings → API Keys** 找到 Project URL 和匿名（anon / publishable）key。

## 3. 配置 GitHub Pages

在 GitHub 仓库的 **Settings → Secrets and variables → Actions → Variables** 新建两个 *Variables*：

- `SUPABASE_URL`：Project URL，例如 `https://example.supabase.co`
- `SUPABASE_ANON_KEY`：匿名（anon / publishable）key

匿名 key 会被发送到浏览器，这是 Supabase 的正常设计；不要填 service-role key。数据表已开启 RLS、未授予浏览器表权限，只有 Edge Function 使用服务器端的 service-role key 读写数据。

然后在 **Settings → Pages** 选择 **GitHub Actions** 作为 Source。推送到 `master` 后，Actions 中的 “Deploy study to GitHub Pages” 会生成页面并发布。

## 4. 测试与导出

发布链接打开后，完成一题并刷新页面；点击“继续上次评价”应能恢复进度。到 Supabase Table Editor 查看 `study_sessions`，或在 SQL Editor 查询：

```sql
select * from public.study_results
where completed = true
order by updated_at;
```

在查询结果菜单中选择导出 CSV。收集期间定期导出备份。

## 安全边界

- 参与者用 128-bit 随机恢复码标识进度；不要在网页或问卷中显示数据库凭据。
- 这不是账号系统，也没有防刷或访问邀请码。若公开链接可能被传播，可在 Edge Function 前加 CAPTCHA、邀请码或限流。
- GitHub Pages 会公开题目图片、网页前端和匿名 key；不要将真实姓名、邮箱等敏感信息放进用户名字段。
