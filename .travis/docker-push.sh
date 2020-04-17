#!/bin/bash
echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
docker build -t fragaria/websocket-proxy:latest .
docker push fragaria/websocket-proxy
