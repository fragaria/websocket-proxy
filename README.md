
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
    node run server <host>:<port> &
    node run client <client-key> <server_host>:<server_port> <forward_to_base_uri> &  # forward-to-* points to a server to forward http to
    client_key=kpz-1
    curl localhost:8080/api/$client_key # path is the path to get from <forward-to-host>


