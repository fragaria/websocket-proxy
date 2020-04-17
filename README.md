
INSTALLATION
----

    # install node and npm
    sudo apt install nodejs npm  # it's roughly 50MB :(

    # clone the repository
    git clone https://github.com/czervenka/ws-proxy-poc.git
    cd ws-proxy-poc

    # install dependencies
    npm install

    # run either
    node run server

    # or client
    node run client

    # test with
    client_key=client-1
    curl localhost:8090/api/$client_key/__ping__ # path is the path to get from <forward-to-host>

Create websocket_proxy.server as docker image
----
    # clone this repository
    git clone https://github.com/fragaria/websocket-proxy.git
    cd websocket-proxy

    # build docker image
    docker build -t fragaria/websocket-proxy:latest .

    # create docker container
    docker create -p 127.0.0.1:8090:8090 --name websocket-proxy fragaria/websocket-proxy:latest
    docker start websocket-proxy

    # to test
    # connect a client
    node client random-client-id http://localhost:8090 http://weevil.info/

Now open your browser and paste url:
`http://localhost:8090/api/random-client-id/` and voilà, what a nice bug you
see.

Install client as a systemd service
===

   # install the application to a well known location
   git clone https://github.com/fragaria/websocket-proxy.git
   sudo cp -ax websocket-proxy /opt/websocket-proxy
   sudo mv /opt/websocket-proxy.service /etc/systemd/system
   sudo mv /opt/websocket_proxy.conf /etc

   # now update /etc/websocket_proxy.conf
   # according to your configuration ...

   # finally enable the installed service
   sudo systemctl daemon-reload
   sudo systemctl enable websocket-proxy



RUN TESTS
---

npm test
