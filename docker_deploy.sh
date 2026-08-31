#!/bin/bash

set -euo pipefail

while getopts ":r:t:" opt; do
  case $opt in
    r)
      DOCKER_PUSH_REGISTRY=$OPTARG
      ;;
    t)
      IMAGE_TAG=$OPTARG
      ;;
    ?)
      echo "invalid arg"
      exit 1
      ;;
  esac
done

IMAGE_NAME=hotspot-v2-backend
DOCKER_PUSH_REGISTRY=${DOCKER_PUSH_REGISTRY:-10.168.0.2:5000}

if [[ -z "${IMAGE_TAG:-}" ]]; then
  if git describe --tags --always --dirty >/dev/null 2>&1; then
    IMAGE_TAG=$(git describe --tags --always --dirty)
  else
    IMAGE_TAG=$(date '+%Y%m%d%H%M%S')
  fi
fi

REMOTE_IMAGE="${DOCKER_PUSH_REGISTRY}/${IMAGE_NAME}"

echo "Building ${IMAGE_NAME}:${IMAGE_TAG}"
docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" -f Dockerfile .

echo "Tagging ${REMOTE_IMAGE}:${IMAGE_TAG} and ${REMOTE_IMAGE}:latest"
docker tag "${IMAGE_NAME}:${IMAGE_TAG}" "${REMOTE_IMAGE}:${IMAGE_TAG}"
docker tag "${IMAGE_NAME}:${IMAGE_TAG}" "${REMOTE_IMAGE}:latest"

echo "Pushing ${REMOTE_IMAGE}:${IMAGE_TAG}"
docker push "${REMOTE_IMAGE}:${IMAGE_TAG}"
docker push "${REMOTE_IMAGE}:latest"

echo "Push docker images done: ${REMOTE_IMAGE}:${IMAGE_TAG}"
