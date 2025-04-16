

#!/bin/bash

error_exit() {
    echo "Error: $1" >&2
    exit 1
}

deploy_docker() {
    echo "Building Docker image..."
    if ! sudo docker build -t codeexport .; then
        error_exit "Docker Build Failed"
    fi
    echo "Running Docker container in interactive mode..."
    if ! sudo docker run --network host codeexport; then
        error_exit "Exited out of Docker"
    fi
}

main() {
    deploy_docker
}

main


  