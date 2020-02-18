INSTALLATION
----

    git clone ws_rev_proxy
    cd ws_rev_proxy
    npm install
    node run server &
    node run client <client-key> <server_host>:<server_port> <forward_to_base_uri> &  # forward-to-* points to a server to forward http to
    client_key=kpz-1
    curl localhost:8080/api/$client_key # path is the path to get from <forward-to-host>
