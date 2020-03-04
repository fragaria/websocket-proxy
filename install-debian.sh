#!/bin/bash
set -eu

VERSION=v0.5

apt install node npmjs
cd /opt
git clone https://github.com/fragaria/websocket-proxy.git --branch $VERSION --depth 1 --single-branch karmen_websocket_proxy
cd karmen_websocket_proxy
mv karmen-websocket-proxy.service /etc/systemd/system
mv /etc/karmen_websocket_proxy.conf /etc
npm install --only=production
