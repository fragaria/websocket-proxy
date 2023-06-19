# websocket-proxy

This package provides a websocket proxy that allows you to overcome networking
difficulties when connecting services running in isolated networks to a cloud.

It does that by providing a websocket channel that proxies local port to
the remote server.


## Installation

```
# install node and npm
sudo apt install nodejs npm  # it's roughly 50MB :(

# clone the repository
git clone https://github.com/fragaria/websocket-proxy.git
cd websocket-proxy

# install dependencies
npm install
```

## Running a server

This will make isolated services available in the cloud.

```
node run server
```

By default, server launches on port **8090**.

Server accepts these environamental variables:

- ADDRESS ... TCP/IP address to listen on (default: localhost)
- PORT: ... TCP/IP port number to bind to (default: 8090)
- KEY_SERVER_URL ... URL to a key server. When set, WS Server will call GET
  request on ``<KEY_SERVER_URL>/key/<client-key>"```. If the othe party
  responds with other status code than 200, the connecting client is
  immediatelly disconnected.
  If KEY_SERVER_URL is undefined, client with any key can connect (default: undefined).

## Configuration environment variables

Client and Server can be configured through environment variables. Forexample
run `KEY=1234 npm run client` to start client with client key 1234. Here is a
list of supported configuration variables.

### Server

- ADDRESS - the address to listen on (default: localhost)
- PORT - port to listen on (default: 8090)
- KEY_SERVER_URL - key-mster API url for authentication or empty to ignore authentication (default: none)
- KEY_SERVER_IGNORE_FOR_HOSTNAMES - hostnames to be ignored for key server (default: none)
- CLIENT_INACTIVE_AFTER_SECS - number of seconds of client inactivity after which the connection is considered dead (default: 90),
- SERVER_CLIENT_LIST_DUMP_FILE - filepath where to keep list of connected clients; If empty, no list is being written (default: none)

### Client

- KEY - client key (default: client-1
- SERVER_URL - url of Websocket Proxy server (default: ws://localhost:8090),
- FORWARD_TO - url where to forward all communication to (default: http://prusa3d.local),
- FORWARD_TO_PORTS - comma separated list of ports where to forward communication to (default: 80,443)

## Connecting a client to the server

Using websocket-proxy client, you can connect your service in your isolated
network to the cloud-hosted websocket-proxy server.

Assuming you have a running server on `http://ws.yourdomain.com`, you can
expose your local port 80 like this:

```
# Connect local port to the cloud-hosted proxy server
client_key=myclient-1
node client $client_key http://ws.yourdomain.com http://localhost:80

# Test your local port is available
curl http://ws.yourdomain.com/api/$client_key/
```

Note the **trailing slash**: **it has to be present**!

## Creating websocket_proxy.server as docker image

```
# Clone this
git clone https://github.com/fragaria/websocket-proxy.git
cd websocket-proxy

# Build docker image
docker build -t fragaria/websocket-proxy:latest .

# Start docker container
docker create -p 127.0.0.1:8090:8090 --name websocket-proxy fragaria/websocket-proxy:latest
docker start websocket-proxy

# Test connecting a client
node client random-client-id http://localhost:8090 http://weevil.info/
```

Now open your browser and paste url:
`http://localhost:8090/api/random-client-id/` and voilà, what a nice bug you
see.

## Installing client as a systemd service

Install the application to a well known location:

```
git clone https://github.com/fragaria/websocket-proxy.git
sudo cp -ax websocket-proxy /opt/websocket-proxy
sudo mv /opt/websocket-proxy.service /etc/systemd/system
sudo mv /opt/websocket_proxy.conf /etc
```

Now modify `/etc/websocket_proxy.conf` accoring to your needs. Finally, enable
the installed service:

```
sudo systemctl daemon-reload
sudo systemctl enable websocket-proxy
```

## Running tests

```
npm test
```
