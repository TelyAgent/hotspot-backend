# Jenkins 部署说明

这个项目可以通过 Jenkins 在服务器本机直接构建 Docker 镜像并部署。

这种方式不依赖内网镜像仓库，适合当前本地推送 `10.168.0.2:5000` 失败的情况。

## 1. Jenkins Job 类型

建议创建：

```text
Pipeline
```

Job 名称建议：

```text
hotspot-v2-backend_prod_job
```

## 2. Git 仓库配置

仓库地址：

```text
git@github.com:TelyAgent/hotspot-backend.git
```

分支：

```text
main
```

Pipeline 脚本路径：

```text
Jenkinsfile
```

## 3. Jenkinsfile 会做什么

`Jenkinsfile` 会自动执行：

```text
拉取代码
→ 在 Jenkins 所在服务器本机构建 Docker 镜像
→ 创建 /home/ops/jenkins_job/hotspot-v2-backend_prod_job
→ 复制 docker-compose.yml 和 service.sh
→ 如果 .env 不存在，则生成 .env 并中断
→ 执行 Prisma 数据库迁移
→ 启动服务
→ 请求 /healthz 做健康检查
```

## 4. 第一次构建为什么可能失败

第一次构建时，如果服务器部署目录里还没有 `.env`，Jenkins 会创建：

```text
/home/ops/jenkins_job/hotspot-v2-backend_prod_job/.env
```

然后主动失败。

这是正常的。

你需要登录服务器，填写真实配置：

```bash
cd /home/ops/jenkins_job/hotspot-v2-backend_prod_job
vim .env
```

至少需要配置：

```bash
DATABASE_URL=postgresql://用户名:密码@数据库地址:5432/hotspot_agent?schema=public
OPENAI_API_KEY=你的生产环境OpenAIKey
TWITTERAPI_IO_KEY=你的TwitterAPIKey
YOUTUBE_API_KEY=你的YouTubeAPIKey
```

保存后重新点 Jenkins 构建即可。

## 5. 服务端口

容器内部端口：

```text
3001
```

服务器宿主机端口：

```text
3002
```

健康检查：

```bash
curl http://127.0.0.1:3002/healthz
```

## 6. 常见问题

### Jenkins 构建时提示 .env 不存在

这是第一次构建的正常保护逻辑。

填写 `.env` 后重新构建。

### 端口 3002 被占用

修改服务器部署目录里的 `.env`：

```bash
HOST_PORT=新的端口
```

同时 Jenkinsfile 里的 `HOST_PORT` 也需要保持一致。

### 数据库迁移失败

优先检查 `.env` 里的：

```bash
DATABASE_URL
```

确认服务器能访问这个 PostgreSQL。

