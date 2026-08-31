pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    PROJECT_NAME = 'hotspot-v2-backend'
    DEPLOY_DIR = '/home/ops/jenkins_job/hotspot-v2-backend_prod_job'
    HOST_PORT = '3002'
  }

  stages {
    stage('准备版本号') {
      steps {
        script {
          env.IMAGE_TAG = "jenkins-${env.BUILD_NUMBER}"
          env.BACKEND_IMAGE = "${env.PROJECT_NAME}:${env.IMAGE_TAG}"
        }
        sh 'echo "本次构建镜像: ${BACKEND_IMAGE}"'
      }
    }

    stage('构建 Docker 镜像') {
      steps {
        sh 'docker build -t "${BACKEND_IMAGE}" -f Dockerfile .'
      }
    }

    stage('准备部署目录') {
      steps {
        sh '''
          set -e
          mkdir -p "${DEPLOY_DIR}/private"
          cp docker-compose.yml "${DEPLOY_DIR}/docker-compose.yml"
          cp service.sh "${DEPLOY_DIR}/service.sh"
          chmod +x "${DEPLOY_DIR}/service.sh"

          if [ ! -f "${DEPLOY_DIR}/.env" ]; then
            cp .env.production.example "${DEPLOY_DIR}/.env"
            echo "已创建 ${DEPLOY_DIR}/.env，请先填写生产环境数据库和 API Key 后重新构建。"
            exit 1
          fi
        '''
      }
    }

    stage('部署服务') {
      steps {
        sh '''
          set -e
          cd "${DEPLOY_DIR}"
          BACKEND_IMAGE="${BACKEND_IMAGE}" SKIP_PULL=true ./service.sh restart "${IMAGE_TAG}"
        '''
      }
    }

    stage('健康检查') {
      steps {
        sh '''
          set -e
          for i in $(seq 1 20); do
            if curl -fsS "http://127.0.0.1:${HOST_PORT}/healthz"; then
              exit 0
            fi
            sleep 3
          done
          echo "健康检查失败"
          docker ps --filter "name=hotspot-v2-backend" || true
          exit 1
        '''
      }
    }
  }
}
