#!/bin/bash
set -eu

#VERSION=v0.5  ## not used for "git clone --branch..." anymore

sudo apt install nodejs npm

cd /tmp
git clone https://github.com/fragaria/websocket-proxy.git --depth 1 --single-branch karmen_websocket_proxy
sudo mv /tmp/karmen_websocket_proxy/ /opt/

sudo chown -R root:root /opt/karmen_websocket_proxy/

cd /opt/karmen_websocket_proxy
sudo mv karmen-websocket-proxy.service /etc/systemd/system
sudo mv karmen_websocket_proxy.conf /etc
sudo npm install --only=production

# TODO: edit /etc/karmen_websocket_proxy.conf

sudo systemctl enable karmen-websocket-proxy

sudo systemctl daemon-reload
