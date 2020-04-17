#!/bin/bash
echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
docker build -t fragaria/websocket-proxy:latest .
docker tag fragaria/websocket-proxy:latest fragaria/websocket-proxy:$TRAVIS_TAG
docker push fragaria/websocket-proxy
