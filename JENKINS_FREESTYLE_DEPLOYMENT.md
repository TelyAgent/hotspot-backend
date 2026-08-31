# Jenkins Freestyle 部署说明

本项目采用和 `telyclaw-backend_prod_job` 一致的 Jenkins Freestyle 部署方式。

整体流程：

```text
Jenkins 拉 Git 仓库
→ Jenkins 执行 docker_deploy.sh
→ 构建 Docker 镜像
→ 推送到内网镜像仓库 10.168.0.2:5000
→ Jenkins 通过 ansible 通知线上服务器重启服务
→ 线上服务器 service.sh 拉镜像、迁移数据库、启动容器
```

## 1. Job 类型

创建 Jenkins Job 时选择：

```text
Freestyle project
```

推荐 Job 名称：

```text
hotspot-agent-backend_prod_job
```

如果后面想统一 V2 命名，也可以用：

```text
hotspot-v2-backend_prod_job
```

但 Jenkins Job 名称、服务器部署目录、shell 里的路径要保持一致。

## 2. General

建议填写 Description：

```html
<h1>Hotspot V2 后端服务</h1>
<h2>热点监测、主题追踪、YouTube 拆解、热点挖掘 Agent API</h2>
```

建议勾选：

```text
This project is parameterized
```

添加参数：

```text
Git Parameter
```

参数配置：

```text
Name: Revision
Parameter Type: Branch
Default Value: origin/main
```

这个参数的意思是：构建时可以选择要部署哪个 Git 分支。

## 3. Source Code Management

选择：

```text
Git
```

Repository URL：

```text
git@github.com:TelyAgent/hotspot-backend.git
```

Credentials：

```text
git (Sending.Me Jenkins Github Account on Ubuntu)
```

Branches to build：

```text
$Revision
```

这个配置表示：Jenkins 会使用上面 `Revision` 参数选中的分支来构建。

## 4. Build Triggers

初期可以都不勾选，手动构建即可。

如果后面要 GitHub push 后自动部署，再勾选：

```text
GitHub hook trigger for GITScm polling
```

## 5. Build Environment

可以先不勾选。

## 6. Build Steps

添加：

```text
Execute shell
```

脚本内容：

```bash
IMAGE_TAG=`git describe --tags --always`
echo "IMAGE_TAG=$IMAGE_TAG"

./docker_deploy.sh -r 10.168.0.2:5000

ansible sendingme -u ops -m shell -a "/bin/bash /home/ops/jenkins_job/hotspot-agent-backend_prod_job/service.sh restart $IMAGE_TAG"
```

脚本含义：

- `git describe --tags --always`：根据当前 Git commit 生成镜像版本号。
- `./docker_deploy.sh -r 10.168.0.2:5000`：构建镜像并推送到内网镜像仓库。
- `ansible sendingme -u ops ...`：通知线上服务器执行部署目录里的 `service.sh restart`。

注意：如果你的服务器目录不是：

```text
/home/ops/jenkins_job/hotspot-agent-backend_prod_job
```

需要同步修改上面 shell 里的路径。

## 7. 线上服务器部署目录

线上服务器需要提前准备目录：

```bash
mkdir -p /home/ops/jenkins_job/hotspot-agent-backend_prod_job/private
```

目录里需要放：

```text
docker-compose.yml
service.sh
.env
private/
```

其中：

- `docker-compose.yml`：从本项目复制。
- `service.sh`：从本项目复制。
- `.env`：从 `.env.production.example` 复制后填写真实配置。
- `private/`：可选，用于放 YouTube cookies 等私密文件。

## 8. 第一次部署前检查

在服务器上确认：

```bash
cd /home/ops/jenkins_job/hotspot-agent-backend_prod_job
ls
```

至少应该看到：

```text
docker-compose.yml
service.sh
.env
```

给脚本加执行权限：

```bash
chmod +x service.sh
```

## 9. 构建完成后检查

在服务器执行：

```bash
cd /home/ops/jenkins_job/hotspot-agent-backend_prod_job
./service.sh status
curl http://127.0.0.1:3002/healthz
```

如果正常，会返回：

```json
{
  "status": "ok",
  "service": "hotspot-v2-backend"
}
```

