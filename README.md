INSTALLATION
----

    git clone ws_rev_proxy
    cd ws_rev_proxy
    npm install
    node run server &
    node run client kpz-1 <forward-to-host> <forward-to-port> & # forward-to-* points to a server to forward http to
    curl localhost:8080/api/kpz-1<path> # path is the path to get from <forward-to-host>
