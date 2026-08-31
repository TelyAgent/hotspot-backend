#!/bin/bash

# Hotspot V2 backend service management script.
# Usage: ./service.sh [start|stop|restart|logs|status|migrate|pull] [IMAGE_TAG]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PROJECT_NAME="hotspot-v2-backend"
DEFAULT_IMAGE_TAG="latest"
DEFAULT_REGISTRY="10.168.0.2:5000"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

check_basic() {
  if [[ ! -f "docker-compose.yml" ]]; then
    echo "错误: 找不到 docker-compose.yml 文件"
    exit 1
  fi
  if [[ ! -f ".env" ]]; then
    echo "错误: 找不到 .env 文件"
    exit 1
  fi
}

pull() {
  local image_tag=${1:-$DEFAULT_IMAGE_TAG}
  local registry=${DOCKER_REGISTRY:-$DEFAULT_REGISTRY}
  log "拉取镜像: $registry/$PROJECT_NAME:$image_tag"
  IMAGE_TAG="$image_tag" DOCKER_REGISTRY="$registry" docker-compose pull backend
}

wait_for_postgres() {
  local image_tag=${1:-$DEFAULT_IMAGE_TAG}
  local registry=${DOCKER_REGISTRY:-$DEFAULT_REGISTRY}
  log "启动并等待 Postgres 就绪..."
  IMAGE_TAG="$image_tag" DOCKER_REGISTRY="$registry" docker-compose up -d postgres
  for i in {1..30}; do
    if IMAGE_TAG="$image_tag" DOCKER_REGISTRY="$registry" docker-compose exec -T postgres pg_isready -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-hotspot_agent}" >/dev/null 2>&1; then
      log "Postgres 已就绪"
      return 0
    fi
    sleep 2
  done
  echo "错误: Postgres 在等待超时后仍未就绪"
  docker-compose logs postgres
  exit 1
}

migrate() {
  local image_tag=${1:-$DEFAULT_IMAGE_TAG}
  local registry=${DOCKER_REGISTRY:-$DEFAULT_REGISTRY}
  log "执行数据库迁移，镜像标签: $image_tag"
  IMAGE_TAG="$image_tag" DOCKER_REGISTRY="$registry" docker-compose run --rm backend npm run prisma:migrate:deploy
}

start() {
  local image_tag=${1:-$DEFAULT_IMAGE_TAG}
  local registry=${DOCKER_REGISTRY:-$DEFAULT_REGISTRY}
  log "启动 $PROJECT_NAME 服务，使用镜像标签: $image_tag"
  check_basic
  pull "$image_tag"
  wait_for_postgres "$image_tag"
  migrate "$image_tag"
  IMAGE_TAG="$image_tag" DOCKER_REGISTRY="$registry" docker-compose up -d
  log "服务启动完成，访问地址: http://localhost:${HOST_PORT:-3002}"
  log "使用的镜像: $registry/$PROJECT_NAME:$image_tag"
}

stop() {
  log "停止 $PROJECT_NAME 服务..."
  docker-compose down
  log "服务已停止"
}

restart() {
  local image_tag=${1:-$DEFAULT_IMAGE_TAG}
  log "重启 $PROJECT_NAME 服务，使用镜像标签: $image_tag"
  stop
  sleep 2
  start "$image_tag"
}

logs() {
  log "显示 $PROJECT_NAME 服务日志..."
  docker-compose logs -f backend
}

status() {
  log "$PROJECT_NAME 服务状态:"
  docker-compose ps
}

help() {
  echo "Hotspot V2 backend 服务管理脚本"
  echo ""
  echo "使用方法:"
  echo "  ./service.sh [命令] [IMAGE_TAG]"
  echo ""
  echo "可用命令:"
  echo "  start [TAG]     拉取镜像、执行迁移并启动服务"
  echo "  stop            停止服务"
  echo "  restart [TAG]   重启服务"
  echo "  migrate [TAG]   只执行数据库迁移"
  echo "  pull [TAG]      只拉取镜像"
  echo "  logs            查看实时日志"
  echo "  status          查看状态"
  echo "  help            显示帮助"
}

command=${1:-help}
image_tag=${2:-$DEFAULT_IMAGE_TAG}

case "$command" in
  start)
    start "$image_tag"
    ;;
  stop)
    stop
    ;;
  restart)
    restart "$image_tag"
    ;;
  migrate)
    check_basic
    migrate "$image_tag"
    ;;
  pull)
    check_basic
    pull "$image_tag"
    ;;
  logs)
    logs
    ;;
  status)
    status
    ;;
  help|--help|-h)
    help
    ;;
  *)
    echo "错误: 未知命令 '$command'"
    help
    exit 1
    ;;
esac
