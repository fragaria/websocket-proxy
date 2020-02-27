
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


RUN TESTS
---

npm tst
